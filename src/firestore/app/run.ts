import {
  DocumentData,
  FieldValue,
  arrayUnion,
  collection,
  doc,
  DocumentReference,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import _intersection from 'lodash/intersection';
import _pick from 'lodash/pick';
import { RoarTaskVariant } from './task';
import { RoarAppUser } from './user';
import { IOrgLists } from '../interfaces';

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
  assigningOrgs?: IOrgLists;
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
  assigningOrgs?: IOrgLists;
  started: boolean;
  completed: boolean;
  /** Create a ROAR run
   * @param {IRunInput} input
   * @param {RoarAppUser} input.user - The user running the task
   * @param {RoarTaskVariant} input.task - The task variant being run
   * @param {IOrgLists} input.assigningOrgs - The ID of the study to which this run belongs
   * @param {string} input.runId = The ID of the run. If undefined, a new run will be created.
   */
  constructor({ user, task, assigningOrgs, runId }: IRunInput) {
    this.user = user;
    this.task = task;
    this.assigningOrgs = assigningOrgs;

    if (runId) {
      this.runRef = doc(this.user.userRef, 'runs', runId);
    } else {
      this.runRef = doc(collection(this.user.userRef, 'runs'));
    }

    if (!this.task.taskRef) {
      throw new Error('Task refs not set. Please use the task.setRefs method first.');
    }
    this.started = false;
    this.completed = false;
  }

  /**
   * Create a new run on Firestore
   * @method
   * @async
   */
  async startRun(additionalRunMetadata?: { [key: string]: unknown }) {
    await this.user.checkUserExists();

    if (this.task.variantRef === undefined) {
      await this.task.toFirestore();
    }

    if (this.assigningOrgs) {
      const userDocSnap = await getDoc(this.user.userRef);
      if (userDocSnap.exists()) {
        const userDocData = userDocSnap.data();
        const userOrgs = _pick(userDocData, Object.keys(this.assigningOrgs));
        for (const orgName of Object.keys(userOrgs)) {
          this.assigningOrgs[orgName] = _intersection(userOrgs[orgName], this.assigningOrgs[orgName]);
        }
      } else {
        // This should never happen because of ``this.user.checkUserExists`` above. But just in case:
        throw new Error('User does not exist');
      }
    }

    const runData = {
      ...additionalRunMetadata,
      assigningOrgs: this.assigningOrgs || null,
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
    })
      .then(() => this.user.updateFirestoreTimestamp())
      .then(() => (this.completed = true));
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
