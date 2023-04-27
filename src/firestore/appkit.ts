import { IAppUserData, RoarAppUser } from './user';
import { ITaskVariantInput, RoarTaskVariant } from './task';
import { RoarRun } from './run';
import { firebaseSignIn, firebaseSignOut } from '../auth';
import { getFirestore, collection, doc, DocumentReference, connectFirestoreEmulator } from 'firebase/firestore';
import {
  FirebaseConfigData,
  EmulatorConfigData,
  RealConfigData,
  roarEnableIndexedDbPersistence,
  safeInitializeApp,
} from './util';
import { initializeApp } from 'firebase/app';

export interface AssessmentConfigData {
  firebaseConfig: FirebaseConfigData;
  rootDoc: string[];
}

/**
 * The RoarAppkit class is the main entry point for the ROAR Firestore API.
 * It represents multiple linked Firestore documents and provides methods
 * for interacting with them.
 */
export class RoarAppkit {
  userInfo: IAppUserData;
  taskInfo: ITaskVariantInput;
  user: RoarAppUser | undefined;
  task: RoarTaskVariant | undefined;
  run: RoarRun | undefined;
  rootDoc: DocumentReference;
  /**
   * Create a RoarAppkit. This expects an object with keys `userInfo`,
   * `taskInfo`, and `confg` where `userInfo` is a [[IAppUserData]] object,
   * `taskInfo` is a [[ITaskVariantInput]] object and `config` is a
   * [[AssessmentConfigData]] object.
   * @param {{userInfo: IAppUserData, taskInfo: ITaskVariantInput, config: AssessmentConfigData}=} destructuredParam
   *     userInfo: The user input object
   *     taskInfo: The task input object
   *     config: Firebase configuration object
   */
  constructor({
    userInfo,
    taskInfo,
    config,
  }: {
    userInfo: IAppUserData;
    taskInfo: ITaskVariantInput;
    config: AssessmentConfigData;
  }) {
    this.userInfo = userInfo;
    this.taskInfo = taskInfo;
    this.user = undefined;
    this.task = undefined;
    this.run = undefined;

    let db;

    if ((config.firebaseConfig as EmulatorConfigData).emulatorPorts) {
      const firebaseApp = initializeApp(
        { projectId: config.firebaseConfig.projectId, apiKey: config.firebaseConfig.apiKey },
        'app-firestore',
      );
      const ports = (config.firebaseConfig as EmulatorConfigData).emulatorPorts;
      db = getFirestore(firebaseApp);
      connectFirestoreEmulator(db, 'localhost', ports.db);
    } else {
      const firebaseApp = safeInitializeApp(config.firebaseConfig as RealConfigData, 'app-firestore');
      db = getFirestore(firebaseApp);
      roarEnableIndexedDbPersistence(db);
    }

    this.rootDoc = doc(collection(db, config.rootDoc[0]), ...config.rootDoc.slice(1));
  }

  /**
   * Start the ROAR run. Push the task, user, and run info to Firestore
   * Call this method before starting the jsPsych experiment.
   * @method
   * @async
   */
  async startRun() {
    const auth = await firebaseSignIn(this.userInfo.id);
    this.user = new RoarAppUser({
      ...this.userInfo,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      firebaseUid: auth.currentUser!.uid,
    });
    this.user.setRefs(this.rootDoc);

    this.task = new RoarTaskVariant(this.taskInfo);
    this.task.setRefs(this.rootDoc);

    this.run = new RoarRun({ user: this.user, task: this.task });

    return (
      this.task
        .toFirestore()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .then(() => this.user!.toFirestore())
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .then(() => this.run!.startRun())
    );
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
   */
  async finishRun() {
    if (this.run) {
      return this.run.finishRun().then(() => firebaseSignOut());
    } else {
      throw new Error('Run is undefined. Use the startRun method first.');
    }
  }

  /**
   * Add new trial data to this run on Firestore.
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
   *     data: { saveToFirestore: true },
   *   }
   * ]
   * jsPsych.init({
   *   timeline: timeline,
   *   on_data_update: function(data) {
   *     if (data.saveToFirestore) {
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
  async writeTrial(trialData: Record<string, unknown>) {
    if (this.run) {
      return this.run.writeTrial(trialData);
    } else {
      throw new Error('Run is undefined. Use the startRun method first.');
    }
  }
}
