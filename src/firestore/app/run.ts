import {
  DocumentData,
  FieldValue,
  arrayUnion,
  collection,
  doc,
  DocumentReference,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { RoarTaskVariant } from './task';
import { RoarAppUser } from './user';

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

export interface IRunScores extends DocumentData {
  theta: number | null;
  thetaSE: number | null;
  numAttempted: FieldValue;
  numCorrect: FieldValue;
  numIncorrect: FieldValue;
}

export interface IRunInput {
  user: RoarAppUser;
  task: RoarTaskVariant;
  studyId?: string;
  runId?: string;
}

/**
 * Class representing a ROAR run.
 *
 * A run is a globally unique collection of successive trials that constitute
 * one user "running" through a single assessment one time.
 */
export class RoarRun {
  user: RoarAppUser;
  task: RoarTaskVariant;
  runRef: DocumentReference;
  studyId: string | null;
  started: boolean;
  /** Create a ROAR run
   * @param {IRunInput} input
   * @param {RoarAppUser} input.user - The user running the task
   * @param {RoarTaskVariant} input.task - The task variant being run
   * @param {string} input.studyId - The ID of the study to which this run belongs
   * @param {string} input.runId = The ID of the run. If undefined, a new run will be created.
   */
  constructor({ user, task, studyId, runId }: IRunInput) {
    this.user = user;
    this.task = task;
    this.studyId = studyId || null;

    if (runId) {
      this.runRef = doc(this.user.userRef, 'runs', runId);
    } else {
      this.runRef = doc(collection(this.user.userRef, 'runs'));
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
  async startRun(additionalRunMetadata?: { [key: string]: unknown }) {
    if (!this.user.isPushedToFirestore) {
      await this.user.toAppFirestore();
    }
    if (this.task.variantRef === undefined) {
      await this.task.toFirestore();
    }

    const runData = {
      ...additionalRunMetadata,
      districtId: this.user.districtId,
      schoolId: this.user.schoolId,
      classIds: this.user.classIds,
      studyId: this.studyId,
      taskId: this.task.taskId,
      variantId: this.task.variantId,
      taskRef: this.task.taskRef,
      variantRef: this.task.variantRef,
      completed: false,
      timeStarted: serverTimestamp(),
      timeFinished: null,
      numAttempted: 0,
      numCorrect: 0,
      numIncorrect: 0,
      theta: null,
      thetaSE: null,
    };

    await setDoc(this.runRef, runData)
      .then(() => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return updateDoc(this.user.userRef, {
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

    return setDoc(trialRef, {
      ...convertTrialToFirestore(trialData),
      serverTimestamp: serverTimestamp(),
    })
      .then(() => {
        const runScores = {
          numAttempted: increment(1),
          theta: trialData.theta || null,
          thetaSE: trialData.thetaSE || null,
        } as IRunScores;

        if (trialData.correct) {
          runScores.numCorrect = increment(1);
        } else {
          runScores.numIncorrect = increment(1);
        }

        return updateDoc(this.runRef, runScores);
      })
      .then(() => {
        this.user.updateFirestoreTimestamp();
      });
  }
}
