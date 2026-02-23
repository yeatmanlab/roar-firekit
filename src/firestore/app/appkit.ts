/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { onAuthStateChanged } from 'firebase/auth';
import { updateDoc, arrayRemove, arrayUnion, DocumentData, DocumentReference, getDoc } from 'firebase/firestore';
import { ref, getDownloadURL, uploadBytesResumable, getStorage, UploadTask } from 'firebase/storage';
import { ComputedScores, RawScores, RoarRun, InteractionEvent, TrialData } from './run';
import { TaskVariantInfo, RoarTaskVariant } from './task';
import { UserInfo, UserUpdateInput, RoarAppUser } from './user';
import { FirebaseProject, OrgLists } from '../../interfaces';
import { FirebaseConfig, initializeFirebaseProject } from '../util';
import Ajv2020, { JSONSchemaType } from 'ajv/dist/2020';
import ajvErrors from 'ajv-errors';

interface DataFlags {
  user?: boolean;
  task?: boolean;
  variant?: boolean;
  run?: boolean;
}

export interface AppkitInput {
  firebaseProject?: FirebaseProject;
  firebaseConfig?: FirebaseConfig;
  userInfo: UserInfo;
  taskInfo: TaskVariantInfo;
  assigningOrgs?: OrgLists;
  readOrgs?: OrgLists;
  assignmentId?: string;
  runId?: string;
  testData?: DataFlags;
  demoData?: DataFlags;
}

type UploadStatus = 'pending' | 'uploading' | 'completed' | 'failed';
interface UploadTaskItem {
  upload: () => UploadTask;
  url: string;
  status: UploadStatus;
  retries: number;
  taskId: string;
  trialRef: DocumentReference<DocumentData> | null;
  errCode?: string;
}
// readaloud only
interface ResultHistoryItem {
  ability: number;
  stim: string;
  time: number;
  video_url: string;
}

/**
 * The RoarAppkit class is the main entry point for ROAR apps using the ROAR
 * Firestore API.  It represents multiple linked Firestore documents and
 * provides methods for interacting with them.
 */
export class RoarAppkit {
  firebaseProject?: FirebaseProject;
  firebaseConfig?: FirebaseConfig;
  run?: RoarRun;
  task?: RoarTaskVariant;
  user?: RoarAppUser;
  testData: DataFlags;
  demoData: DataFlags;
  private _userInfo: UserInfo;
  private _taskInfo: TaskVariantInfo;
  private _assigningOrgs?: OrgLists;
  private _readOrgs?: OrgLists;
  private _assignmentId?: string;
  private _runId?: string;
  private _authenticated: boolean;
  private _initialized: boolean;
  private _started: boolean;
  private _uploadQueue: Array<UploadTaskItem>;
  private _isQueueRunning: boolean;
  /**
   * Create a RoarAppkit.
   *
   * @param {AppkitInput} input
   * @param {UserInfo} input.userInfo - The user input object
   * @param {TaskVariantInfo} input.taskInfo - The task input object
   * @param {OrgLists} input.assigningOrgs - The IDs of the orgs to which this run belongs
   * @param {OrgLists} input.readOrgs - The IDs of the orgs that can read this run
   * @param {string} input.assignmentId - The ID of the assignment this run belongs to
   * @param {string} input.runId - The ID of the run. If undefined, a new run will be created.
   * @param {DataFlags} input.testData - Boolean flags indicating whether the user, task, or run are test data
   * @param {DataFlags} input.demoData - Boolean flags indicating whether the user, task, or run are demo data
   */
  constructor({
    firebaseProject,
    firebaseConfig,
    userInfo,
    taskInfo,
    assigningOrgs,
    readOrgs,
    assignmentId,
    runId,
    testData,
    demoData,
  }: AppkitInput) {
    if (!firebaseProject && !firebaseConfig) {
      throw new Error('You must provide either a firebaseProjectKit or firebaseConfig');
    }

    if (firebaseProject && firebaseConfig) {
      throw new Error('You must provide either a firebaseProjectKit or firebaseConfig, not both');
    }

    this.firebaseConfig = firebaseConfig;
    this.firebaseProject = firebaseProject;

    this._userInfo = userInfo;
    this._taskInfo = taskInfo;
    this._assigningOrgs = assigningOrgs;
    this._readOrgs = readOrgs ?? assigningOrgs;
    this._assignmentId = assignmentId;
    this._runId = runId;

    this.testData = testData ?? { user: false, task: false, run: false };
    this.demoData = demoData ?? { user: false, task: false, run: false };

    this._authenticated = false;
    this._initialized = false;
    this._started = false;

    this._uploadQueue = [];
    this._isQueueRunning = false;
  }

  private async _init() {
    if (this.firebaseConfig) {
      this.firebaseProject = await initializeFirebaseProject(this.firebaseConfig, 'assessmentApp');
    }

    onAuthStateChanged(this.firebaseProject!.auth, (user) => {
      this._authenticated = Boolean(user);
    });

    this.user = new RoarAppUser({
      ...this._userInfo,
      db: this.firebaseProject!.db,
      // Use conditional spreading here to prevent overwriting testData or
      // demoData from this._taskInfo. Only if the below values are true do we
      // want to overwrite.
      ...(this.testData.user && { testData: true }),
      ...(this.demoData.user && { demoData: true }),
    });
    this.task = new RoarTaskVariant({
      // Define testData and demoData first so that spreading this._taskInfo can
      // overwrite them.
      testData: {
        task: this.testData.task,
        variant: this.testData.variant,
      },
      demoData: {
        task: this.demoData.task,
        variant: this.demoData.variant,
      },
      ...this._taskInfo,
      db: this.firebaseProject!.db,
    });
    this.run = new RoarRun({
      user: this.user,
      task: this.task,
      assigningOrgs: this._assigningOrgs,
      readOrgs: this._readOrgs,
      assignmentId: this._assignmentId,
      runId: this._runId,
      testData: this.testData.run,
      demoData: this.demoData.run,
    });
    await this.user.init();
    this._initialized = true;
  }

  get authenticated(): boolean {
    return this._authenticated;
  }

  /**
   * Update the user's data (both locally and in Firestore).
   * @param {object} input
   * @param {string[]} input.tasks - The tasks to be added to the user doc
   * @param {string[]} input.variants - The variants to be added to the user doc
   * @param {string} input.assessmentPid - The assessment PID of the user
   * @param {*} input.userMetadata - Any additional user metadata
   * @method
   * @async
   */
  async updateUser({ tasks, variants, assessmentPid, ...userMetadata }: UserUpdateInput): Promise<void> {
    if (!this._initialized) {
      await this._init();
    }

    if (!this.authenticated) {
      throw new Error('User must be authenticated to update their own data.');
    }

    return this.user!.updateUser({
      tasks,
      variants,
      assessmentPid,
      ...userMetadata,
    });
  }

  /**
   * Start the ROAR run. Push the task and run info to Firestore.
   * Call this method before starting the jsPsych experiment.
   * @method
   * @async
   */
  async startRun(additionalRunMetadata?: { [key: string]: string }) {
    if (!this._initialized) {
      await this._init();
    }

    if (!this.authenticated) {
      throw new Error('User must be authenticated to start a run.');
    }

    return this.run!.startRun(additionalRunMetadata).then(() => (this._started = true));
  }

  /**
   * Validate the task variant parameters against a given JSON schema.
   *
   * This method uses the AJV library to validate the `variantParams` from the task information
   * against the provided JSON schema. If the parameters are invalid, it throws an error with
   * detailed messages for each validation error.
   *
   * @param {JSONSchemaType<unknown>} parameterSchema - The JSON schema to validate the parameters against.
   * @throws {Error} Throws an error if the parameters are invalid, including detailed validation error messages.
   */
  async validateParameters(parameterSchema: JSONSchemaType<unknown>) {
    // This version of ajv is not compatible with other JSON schema versions.
    const ajv = new Ajv2020({ allErrors: true, verbose: true });
    ajvErrors(ajv);

    const validate = ajv.compile(parameterSchema);
    const variantParams = this._taskInfo.variantParams;
    const valid = validate(variantParams);

    if (!valid) {
      const errorMessages = validate.errors
        ?.map((error) => {
          return `Error in parameter "${error.instancePath}": ${error.message}`;
        })
        .join('\n');
      throw new Error(`Detected invalid game parameters. \n\n${errorMessages}`);
    } else {
      console.log('Parameters successfully validated.');
    }
  }

  /**
   * Update the ROAR task's game parameters.
   * This must be called after the startRun() method.
   *
   * @method
   * @async
   */
  async updateTaskParams(newParams: { [key: string]: unknown }) {
    if (this._started) {
      const oldVariantId = this.task!.variantId;
      return this.task!.updateTaskParams(newParams)
        .then(() => {
          return updateDoc(this.user!.userRef, {
            variants: arrayRemove(oldVariantId),
          });
        })
        .then(() => {
          return updateDoc(this.user!.userRef, {
            variants: arrayUnion(this.task!.variantId),
          });
        })
        .then(() => {
          return updateDoc(this.run!.runRef, {
            variantId: this.task!.variantId,
          });
        });
    } else {
      throw new Error('This run has not started. Use the startRun method first.');
    }
  }

  /**
   * Add interaction data for the current trial
   * 
   * This will keep a running log of interaction data for the current trial.
   * The log will be reset after each `writeTrial` call.
   
   * @param {InteractionEvent} interaction - interaction event
   * @method
   * @async
   */
  addInteraction(interaction: InteractionEvent) {
    if (this._started) {
      return this.run!.addInteraction(interaction);
    } else {
      throw new Error('This run has not started. Use the startRun method first.');
    }
  }

  /**
   * Update the engagement flags for the current run.
   *
   * @param {string[]} flagNames - The names of the engagement flags to add.
   * @param {boolean} markAsReliable - Whether or not to mark the run as reliable, defaults to false
   * @method
   * @async
   *
   * Please note that calling this function with a new set of engagement flags will
   * overwrite the previous set.
   */
  async updateEngagementFlags(flagNames: string[], markAsReliable = false, reliableByBlock = undefined) {
    if (this._started) {
      return this.run!.addEngagementFlags(flagNames, markAsReliable, reliableByBlock);
    } else {
      throw new Error('This run has not started. Use the startRun method first.');
    }
  }

  /**
   * Finish the ROAR run by marking it as finished in Firestore.
   * Call this method after the jsPsych experiment finishes. For example:
   *
   * ```javascript
   * jsPsych.init({
   *   timeline: exp,
   *   on_finish: function(data) {
   *     firekit.finishRun();
   *   }
   * });
   * ```
   * @method
   * @async
   * @param {Object} [finishingMetaData={}] - Optional metadata to include when marking the run as complete.
   * @returns {Promise<boolean | undefined>} - Resolves when the run has been marked as complete.
   * @throws {Error} - Throws an error if the run has not been started yet.
   */
  async finishRun(finishingMetaData: { [key: string]: unknown } = {}) {
    if (this._started) {
      return this.run!.finishRun(finishingMetaData);
    } else {
      throw new Error('This run has not started. Use the startRun method first.');
    }
  }

  /**
   * Abort the ROAR run, preventing any further writes to Firestore.
   * @method
   */
  abortRun() {
    if (this._started) {
      this.run!.abortRun();
    } else {
      throw new Error('This run has not started. Use the startRun method first.');
    }
  }

  /**
   * Add new trial data to this run on Firestore.
   *
   * ROAR expects certain data to be added to each trial:
   * - assessment_stage: string, either practice_response or test_response
   * - correct: boolean, whether the correct answer was correct
   * - subtask: string (optional), the name of the subtask
   * - thetaEstimate: number (optional), the ability estimate for adaptive assessments
   * - thetaSE: number (optional), the standard error of the ability estimate for adaptive assessments
   *
   * This method can be added to individual jsPsych trials by calling it from
   * the `on_finish` function, like so:
   *
   * ```javascript
   * var trial = {
   *   type: 'image-keyboard-response',
   *   stimulus: 'imgA.png',
   *   on_finish: function(data) {
   *     firekit.addTrialData(data);
   *   }
   * };
   * ```
   *
   * Or you can call it from all trials in a jsPsych
   * timeline by calling it from the `on_data_update` callback. In the latter
   * case, you can avoid saving extraneous trials by conditionally calling
   * this method based on the data. For example:
   *
   * ```javascript
   * const timeline = [
   *   // A fixation trial; don't save to Firestore
   *   {
   *     type: htmlKeyboardResponse,
   *     stimulus: '<div style="font-size:60px;">+</div>',
   *     choices: "NO_KEYS",
   *     trial_duration: 500,
   *   },
   *   // A stimulus and response trial; save to Firestore
   *   {
   *     type: imageKeyboardResponse,
   *     stimulus: 'imgA.png',
   *     data: { save: true },
   *   }
   * ]
   * jsPsych.init({
   *   timeline: timeline,
   *   on_data_update: function(data) {
   *     if (data.save) {
   *       firekit.addTrialData(data);
   *     }
   *   }
   * });
   * ```
   *
   * @method
   * @async
   * @param {*} trialData - An object containing trial data.
   */
  async writeTrial(trialData: TrialData, computedScoreCallback?: (rawScores: RawScores) => Promise<ComputedScores>) {
    if (this._started) {
      return this.run!.writeTrial(trialData, computedScoreCallback);
    } else {
      throw new Error('This run has not started. Use the startRun method first.');
    }
  }

  async getStorageDownloadUrl(filePath: string) {
    if (!this._initialized) {
      await this._init();
    }

    const storageRef = ref(this.firebaseProject!.storage, filePath);
    return getDownloadURL(storageRef);
  }

  generateUploadBucket() {
    const appIdParts = this.firebaseProject!.firebaseApp.options.projectId?.split('-');
    return `gs://roar-assessment-recordings-${appIdParts?.length === 3 ? 'prod' : appIdParts?.[3]}`;
  }

  /**
   * Generates a standardized file path for recordings.
   * @param {string} taskId - The task ID
   * @param {string} fileName - The file name
   * @param {string} [assessmentPid] - Optional assessmentPiD. Prioritizes assigned assessmentPid and defaults to assessmentUid
   * @returns Standardized file path for recordings
   */
  generateFilePath({ taskId, fileName, assessmentPid }: { taskId: string; fileName: string; assessmentPid?: string }) {
    if (!this.authenticated) {
      throw new Error('User must be authenticated to generate file path.');
    }

    const runId = this.run?.runRef?.id;
    const uid = this.user!.assessmentUid;
    const administrationId = this._assignmentId ?? 'guest-administration';
    let pid = '';

    if (this.user?.assessmentPid) {
      pid = this.user.assessmentPid;
    } else if (assessmentPid && assessmentPid.length > 0) {
      pid = assessmentPid;
    } else {
      pid = uid;
    }

    return `${taskId}/${uid}/${pid}/${administrationId}/${runId}/${fileName}`;
  }

  /**
   * Upload recordings to GCP using Firebase SDK.
   * The Firebase project and storage bucket are environment-specific.
   * Bucket format: "roar-assessment-recordings-{environment}".
   * @param {string} taskId - The task ID
   * @param {string} fileName - The file name
   * @param {string} [assessmentPid] - Optional assessmentPid.
   * @param {File | Blob} fileOrBlob - The file or blob to upload
   * @param {Record<string, string>} [customMetadata] - Optional metadata to attach to the file (see SettableMetadata interface in Firebase docs)
   * @returns url of the uploaded file
   */
  async uploadFileOrBlobToStorage({
    taskId,
    fileName,
    assessmentPid,
    fileOrBlob,
    customMetadata,
  }: {
    taskId: string;
    fileName: string;
    assessmentPid?: string;
    fileOrBlob: File | Blob;
    customMetadata?: Record<string, string>;
  }) {
    if (!this._initialized) {
      await this._init();
    }

    if (!this.authenticated) {
      throw new Error('User must be authenticated to upload files to storage.');
    }

    if (!this.run?._currentTrialRef) {
      throw new Error('Current trial reference not found for upload.');
    }

    /*
      uncomment when ready to merge
      if (!bucket || !filePath || !fileOrBlob) {
        throw new Error('Bucket, file path, and file/blob are required');
      }
    */

    const filePath = this.generateFilePath({ taskId, fileName, assessmentPid });

    const storageBucket = getStorage(this.firebaseProject!.firebaseApp, this.generateUploadBucket());
    const storageRef = ref(storageBucket, filePath);
    const storageUrl = storageRef.toString();

    // TODO: Better handling of trial ref type
    this._uploadQueue.push({
      upload: () => uploadBytesResumable(storageRef, fileOrBlob, { customMetadata }),
      trialRef: this.run._currentTrialRef,
      taskId,
      url: storageUrl,
      status: 'pending',
      retries: 0,
    });

    await this.processUploadQueue();
    return storageUrl;
  }

  /**
   * Calculates exponential backoff delay with jitter for retry attempts.
   * @param retryCount - Number of retry attempts made so far
   * @param {number} [baseDelay=1000] - Base delay in milliseconds (default: 1000ms)
   * @param {number} [maxDelay=30000] - Maximum delay in milliseconds (default: 30000ms)
   * @returns Calculated delay in milliseconds
   */
  getBackoffDelay(retryCount: number, baseDelay = 1000, maxDelay = 30000) {
    const exponential = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * exponential;
    return Math.min(exponential + jitter, maxDelay);
  }

  /**
   * Finds the trial document that corresponds to video file url
   * RAN stores it as top-level uploadUrl field
   * Readaloud stores them in stimulus objects in historyOfResults array
   * @param trialRef - The reference to the trial document.
   * @param taskId - The ID of the task.
   * @param url - The upload URL to search for.
   * @returns A promise that resolves to an object containing the trial document and its index, or null if not found.
   */
  async findStimulusIndex({
    trialRef,
    taskId,
    url,
  }: {
    trialRef: DocumentReference<DocumentData> | null;
    taskId: string;
    url: string;
  }) {
    if (!trialRef) {
      console.error('Trial reference not found for upload:', url);
      return null;
    }

    let stimulusIndex = 0;
    if (taskId === 'roar-readaloud') {
      const trialSnapshot = await getDoc(trialRef);
      stimulusIndex = trialSnapshot
        .data()
        ?.historyOfResults?.findIndex((result: ResultHistoryItem) => result.video_url === url);

      if (stimulusIndex === -1) {
        console.error('Trial not found for upload:', url);
        return null;
      }
    }

    return stimulusIndex;
  }

  /**
   * Updates the trial document with the upload status
   * Overwrites video url (used to match trials) with null if upload fails
   * @param nextTask - The upload task item to update
   * @param trialIndex - The index of the trial in the upload status array
   * @param status - The upload status
   * @param errCode - The error code if the upload failed
   */
  async updateTrialStatus({
    nextTask,
    stimulusIndex,
    status,
    errCode,
  }: {
    nextTask: UploadTaskItem;
    stimulusIndex: number;
    status: UploadStatus;
    errCode?: string;
  }) {
    if (!nextTask.trialRef || !stimulusIndex) return;

    nextTask.status = status;
    nextTask.errCode = errCode;

    // TODO: Should we be setting errCode to null or just not setting it for success cases?
    await updateDoc(nextTask.trialRef, {
      [`uploadStatus.${stimulusIndex}`]: {
        status,
        errCode: errCode ?? null,
      },
    });

    if (status === 'completed') {
      console.log('Upload completed for', nextTask.url);
      if (nextTask.taskId === 'ran') {
        await updateDoc(nextTask.trialRef, {
          uploadUrl: nextTask.url,
        });
      }
    } else if (status === 'failed') {
      console.error('Upload failed for', nextTask.url, errCode);
      if (nextTask.taskId === 'ran') {
        await updateDoc(nextTask.trialRef, {
          uploadUrl: null,
        });
      } else if (nextTask.taskId === 'roar-readaloud') {
        const historyOfResults = (await getDoc(nextTask.trialRef)).data()?.historyOfResults;
        historyOfResults[stimulusIndex].video_url = null;
        await updateDoc(nextTask.trialRef, {
          historyOfResults,
        });
      }
    }

    this._isQueueRunning = false;
    await this.processUploadQueue();
  }

  /**
   * Goes through the queue of pending uploads and processes them one at a time.
   * Retries failed uploads with exponential backoff.
   * @returns void
   */
  async processUploadQueue() {
    if (this._isQueueRunning) return;
    // TODO: Unshift or keep all completed and filter as tasks switch? (mainly concerned about dashboard)
    const nextTask = this._uploadQueue.find((task) => task.status === 'pending');
    if (!nextTask) return;

    this._isQueueRunning = true;
    nextTask.status = 'uploading';

    const activeTask = nextTask.upload();
    const stimulusIndex = await this.findStimulusIndex(nextTask);

    if (stimulusIndex == null) {
      console.error('Trial not found for upload:', nextTask.url);
      this._isQueueRunning = false;
      return;
    }

    const doUploadTrialStatus = async (status: UploadStatus, errCode?: string) =>
      await this.updateTrialStatus({ nextTask, status, errCode, stimulusIndex });

    console.log('activeTask', activeTask);

    activeTask.on(
      'state_changed',
      (snapshot) => {
        // TODO: Progress updates
        console.log('snapshot', snapshot);
      },
      async (error) => {
        // TODO: Update codes: https://firebase.google.com/docs/reference/js/storage.md#storageerrorcode
        const retryableErrors = [
          'internal-error',
          'unknown',
          'invalid-checksum',
          'cannot-slice-blob',
          'server-file-wrong-size',
        ];
        if (nextTask.retries < 3 && retryableErrors.includes(error.code)) {
          const delay = this.getBackoffDelay(nextTask.retries);
          nextTask.retries++;
          nextTask.status = 'pending';

          setTimeout(() => {
            this.processUploadQueue();
          }, delay);
        } else {
          await doUploadTrialStatus('failed', error.code);
        }
      },
      async () => {
        console.log('completed');
        await doUploadTrialStatus('completed');
      },
    );
  }
}
