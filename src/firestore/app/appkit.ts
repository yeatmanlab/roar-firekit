import { initializeApp } from 'firebase/app';
import {
  Auth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  DocumentReference,
  Firestore,
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
} from 'firebase/firestore';

import { roarEmail } from '../../auth';
import { RoarRun } from './run';
import { ITaskVariantInput, RoarTaskVariant } from './task';
import { IAppUserData, RoarAppUser } from './user';
import {
  EmulatorConfigData,
  FirebaseConfigData,
  RealConfigData,
  roarEnableIndexedDbPersistence,
  safeInitializeApp,
} from '../util';

export interface AssessmentConfigData {
  firebaseConfig: FirebaseConfigData;
  rootDoc: string[];
}

interface IAppkitConstructorParams {
  userInfo: IAppUserData;
  taskInfo: ITaskVariantInput;
  config: AssessmentConfigData;
}

/**
 * The RoarAppkit class is the main entry point for the ROAR Firestore API.
 * It represents multiple linked Firestore documents and provides methods
 * for interacting with them.
 */
export class RoarAppkit {
  auth: Auth;
  db: Firestore;
  isAuthenticated: boolean;
  rootDoc: DocumentReference;
  run: RoarRun | undefined;
  task: RoarTaskVariant | undefined;
  taskInfo: ITaskVariantInput;
  user: RoarAppUser | undefined;
  userInfo: IAppUserData;
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
  constructor({ userInfo, taskInfo, config }: IAppkitConstructorParams) {
    this.userInfo = userInfo;
    this.taskInfo = taskInfo;
    this.user = undefined;
    this.task = undefined;
    this.run = undefined;
    this.isAuthenticated = false;

    let db: Firestore;
    let auth: Auth;

    if ((config.firebaseConfig as EmulatorConfigData).emulatorPorts) {
      const firebaseApp = initializeApp(
        { projectId: config.firebaseConfig.projectId, apiKey: config.firebaseConfig.apiKey },
        'app-firestore',
      );
      const ports = (config.firebaseConfig as EmulatorConfigData).emulatorPorts;
      db = getFirestore(firebaseApp);
      auth = getAuth(firebaseApp);

      connectFirestoreEmulator(db, 'localhost', ports.db);

      const originalInfo = console.info;
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      console.info = () => {};
      connectAuthEmulator(auth, `http://localhost:${ports.auth}`);
      console.info = originalInfo;
    } else {
      const firebaseApp = safeInitializeApp(config.firebaseConfig as RealConfigData, 'app-firestore');
      db = getFirestore(firebaseApp);
      roarEnableIndexedDbPersistence(db);
      auth = getAuth(firebaseApp);
    }

    this.db = db;
    this.auth = auth;

    onAuthStateChanged(auth, (user) => {
      if (user) {
        this.isAuthenticated = true;
      } else {
        this.isAuthenticated = false;
      }
    });

    this.rootDoc = doc(collection(db, config.rootDoc[0]), ...config.rootDoc.slice(1));
  }

  async signInWithEmailAndPassword(roarPid: string, password: string) {
    return createUserWithEmailAndPassword(this.auth, roarEmail(roarPid), password).catch((error) => {
      if (error.code === 'auth/email-already-in-use') {
        // console.log('Email already in use');
        return signInWithEmailAndPassword(this.auth, roarEmail(roarPid), password);
      } else {
        throw error;
      }
    });
  }

  async signOut() {
    return this.auth.signOut();
  }

  /**
   * Start the ROAR run. Push the task, user, and run info to Firestore
   * Call this method before starting the jsPsych experiment.
   * @method
   * @async
   */
  async startRun() {
    if (!this.isAuthenticated) {
      throw new Error('The user must be authenticated to start a run.');
    }

    this.user = new RoarAppUser({
      ...this.userInfo,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      firebaseUid: this.auth.currentUser!.uid,
    });
    this.user.setRefs(this.rootDoc);

    this.task = new RoarTaskVariant(this.taskInfo);
    this.task.setRefs(this.rootDoc);

    this.run = new RoarRun({ user: this.user, task: this.task });

    return (
      this.task
        .toFirestore()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .then(() => this.user!.toAppFirestore())
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
      return this.run.finishRun();
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
