import { collection, doc, DocumentReference, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { RoarUser } from './user';

/** Convert a trial data to allow storage on Cloud Firestore
 *
 * This function leaves all other trial data intact but converts
 * any URL object to a string.
 *
 * @function
 * @param {Object} trialData - Trial data to convert
 * @returns {Object} Converted trial data
 */
const convertTrialToFirestore = (trialData: object): object => {
  return Object.fromEntries(
    Object.entries(trialData).map(([key, value]) => {
      if (value instanceof URL) {
        return [key, value.toString()];
      } else {
        return [key, value];
      }
    }),
  );
};

export interface RunInput {
  user: RoarUser;
  taskId: string;
  variantId: string;
}

/** Class representing a ROAR run
 * A run is a globally unique collection of successive trials that constitute
 * one user "running" through a single task one time.
 */
export class RoarRun {
  user: RoarUser;
  taskId: string;
  variantId: string;
  runRef: DocumentReference;
  started: boolean;
  /** Create a ROAR run
   * @param {RoarUser} user - The user running the task
   * @param {string} taskId - The ID of the task.
   * @param {string} variantId - The ID of the task variant.
   */
  constructor({ user, taskId, variantId }: RunInput) {
    if (!(user.userCategory === 'student')) {
      throw new Error('Only students can start a run.');
    }

    this.user = user;
    this.taskId = taskId;
    this.variantId = variantId;
    if (this.user.userRef) {
      this.runRef = doc(collection(this.user.userRef, 'runs'));
    } else {
      throw new Error('User refs not set. Please use the user.setRefs method first.');
    }
    this.started = false;
  }

  /**
   * Create a new run on Firestore
   * @method
   * @async
   */
  async startRun() {
    if (!this.user.isPushedToFirestore) {
      await this.user.toFirestore();
    }
    const runData = {
      districtId: this.user.districtId,
      schoolId: this.user.schoolId,
      classId: this.user.classId,
      studyId: this.user.studyId,
      userId: this.user.id,
      taskId: this.taskId,
      variantId: this.variantId,
      completed: false,
      timeStarted: serverTimestamp(),
      timeFinished: null,
      lastUpdated: serverTimestamp(),
    };
    await setDoc(this.runRef, runData).then(() => {
      this.user.updateFirestoreTimestamp();
    });
    this.started = true;
  }

  /**
   * Mark this run as complete on Firestore
   * @method
   * @async
   */
  async finishRun() {
    if (!this.started) {
      throw new Error('Run has not been started yet. Use the startRun method first.');
    }
    updateDoc(this.runRef, {
      completed: true,
      timeFinished: serverTimestamp(),
    }).then(() => {
      this.user.updateFirestoreTimestamp();
    });
  }

  /**
   * Add a new trial to this run on Firestore
   *
   * This method expects a trialData object with at least the following keys:
   * [block, corpusId, correct, difficulty, startTime, stimulusRule, trial_type,
   * trial_index, time_elapsed, internal_node_id, response, rt, stimulus]
   * @method
   * @async
   * @param {*} trialData - An object containing trial data.
   */
  async writeTrial(trialData: Record<string, unknown>) {
    if (!this.started) {
      throw new Error('Run has not been started yet. Use the startRun method first.');
    }
    const trialRef = doc(collection(this.runRef, 'trials'));
    setDoc(trialRef, convertTrialToFirestore(trialData)).then(() => {
      this.user.updateFirestoreTimestamp();
    });
  }
}
