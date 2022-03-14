import { arrayUnion, collection, doc, DocumentReference, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { RoarTaskVariant } from './task';
import { RoarUser } from './user';

/**
 * Convert a trial data to allow storage on Cloud Firestore.
 *
 * This function leaves all other trial data intact but converts
 * any URL object to a string.
 *
 * @function
 * @param {Object} trialData - Trial data to convert
 * @returns {Object} Converted trial data
 */
export const convertTrialToFirestore = (trialData: object): object => {
  return Object.fromEntries(
    Object.entries(trialData).map(([key, value]) => {
      if (value instanceof URL) {
        return [key, value.toString()];
      } else if (typeof value === 'object' && value !== null) {
        return [key, convertTrialToFirestore(value)];
      } else {
        return [key, value];
      }
    }),
  );
};

export interface RunInput {
  user: RoarUser;
  task: RoarTaskVariant;
}

/**
 * Class representing a ROAR run.
 *
 * A run is a globally unique collection of successive trials that constitute
 * one user "running" through a single task one time.
 */
export class RoarRun {
  user: RoarUser;
  task: RoarTaskVariant;
  runRef: DocumentReference;
  started: boolean;
  /** Create a ROAR run
   * @param {RoarUser} user - The user running the task
   * @param {RoarTaskVariant} task - The task variant being run
   */
  constructor({ user, task }: RunInput) {
    if (!(user.userCategory === 'student')) {
      throw new Error('Only students can start a run.');
    }

    this.user = user;
    this.task = task;
    if (this.user.userRef) {
      this.runRef = doc(collection(this.user.userRef, 'runs'));
    } else {
      throw new Error('User refs not set. Please use the user.setRefs method first.');
    }
    if (!this.task.taskRef) {
      throw new Error('Task refs not set. Please use the task.setRefs method first.');
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
    if (this.task.variantRef === undefined) {
      await this.task.toFirestore();
    }
    const runData = {
      districtId: this.user.districtId,
      schoolId: this.user.schoolId,
      classId: this.user.classId,
      studyId: this.user.studyId,
      taskId: this.task.taskId,
      variantId: this.task.variantId,
      taskRef: this.task.taskRef,
      variantRef: this.task.variantRef,
      completed: false,
      timeStarted: serverTimestamp(),
      timeFinished: null,
    };

    await setDoc(this.runRef, runData)
      .then(() => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return updateDoc(this.user.userRef!, {
          tasks: arrayUnion(this.task.taskId),
          variants: arrayUnion(this.task.variantId),
          taskRefs: arrayUnion(this.task.taskRef),
          variantRefs: arrayUnion(this.task.variantRef),
        });
      })
      .then(() => this.user.updateFirestoreTimestamp());

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
    return updateDoc(this.runRef, {
      completed: true,
      timeFinished: serverTimestamp(),
    }).then(() => {
      return this.user.updateFirestoreTimestamp();
    });
  }

  /**
   * Add a new trial to this run on Firestore
   * @method
   * @async
   * @param {*} trialData - An object containing trial data.
   */
  async writeTrial(trialData: Record<string, unknown>) {
    if (!this.started) {
      throw new Error('Run has not been started yet. Use the startRun method first.');
    }
    const trialRef = doc(collection(this.runRef, 'trials'));
    return setDoc(trialRef, convertTrialToFirestore(trialData)).then(() => {
      this.user.updateFirestoreTimestamp();
    });
  }
}
