/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { onAuthStateChanged } from 'firebase/auth';
import { updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { ComputedScores, RawScores, RoarRun } from './run';
import { TaskVariantInfo, RoarTaskVariant } from './task';
import { UserInfo, UserUpdateInput, RoarAppUser } from './user';
import { FirebaseProject, OrgLists } from '../../interfaces';
import { FirebaseConfig, initializeFirebaseProject } from '../util';

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
  parentUser?: RoarAppUser;
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
  protected _userInfo: UserInfo;
  protected _taskInfo: TaskVariantInfo;
  protected _assigningOrgs?: OrgLists;
  protected _readOrgs?: OrgLists;
  protected _assignmentId?: string;
  protected _runId?: string;
  protected _authenticated: boolean;
  protected _initialized: boolean;
  protected _started: boolean;
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
  }

  protected async _init() {
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

    return this.user!.updateUser({ tasks, variants, assessmentPid, ...userMetadata });
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
          return updateDoc(this.user!.userRef, { variants: arrayRemove(oldVariantId) });
        })
        .then(() => {
          return updateDoc(this.user!.userRef, { variants: arrayUnion(this.task!.variantId) });
        })
        .then(() => {
          return updateDoc(this.run!.runRef, { variantId: this.task!.variantId });
        });
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
  async writeTrial(
    trialData: Record<string, unknown>,
    computedScoreCallback?: (rawScores: RawScores) => Promise<ComputedScores>,
  ) {
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
}
