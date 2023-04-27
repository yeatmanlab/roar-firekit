import {
  arrayUnion,
  collection,
  doc,
  DocumentReference,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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

export const calculateRunScores = async (runRef: DocumentReference): Promise<object> => {
  // First get a count of all trials for this run
  const trialsCollection = collection(runRef, 'trials');
  let countSnapshot = await getCountFromServer(trialsCollection);
  const numAttempted = countSnapshot.data().count;

  // Get a count of all correct trials for this run
  let query_ = query(trialsCollection, where('correct', '==', true));
  countSnapshot = await getCountFromServer(query_);
  const numCorrect = countSnapshot.data().count;

  // Get a count of all incorrect trials for this run
  query_ = query(trialsCollection, where('correct', '==', false));
  countSnapshot = await getCountFromServer(query_);
  const numIncorrect = countSnapshot.data().count;

  // Get the last trial
  query_ = query(trialsCollection, orderBy('serverTimestamp', 'desc'), limit(1));
  const querySnapshot = await getDocs(query_);

  let theta = null;
  let thetaSE = null;
  querySnapshot.forEach((doc) => {
    theta = doc.data().theta || null;
    thetaSE = doc.data().thetaSE || null;
  });

  return {
    numAttempted,
    numCorrect,
    numIncorrect,
    theta,
    thetaSE,
  };
};

export interface IRunInput {
  user: RoarAppUser;
  task: RoarTaskVariant;
}

/**
 * Class representing a ROAR run.
 *
 * A run is a globally unique collection of successive trials that constitute
 * one user "running" through a single task one time.
 */
export class RoarRun {
  user: RoarAppUser;
  task: RoarTaskVariant;
  runRef: DocumentReference;
  started: boolean;
  /** Create a ROAR run
   * @param {RoarAppUser} user - The user running the task
   * @param {RoarTaskVariant} task - The task variant being run
   */
  constructor({ user, task }: IRunInput) {
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

    const runScores = await calculateRunScores(this.runRef);

    return updateDoc(this.runRef, {
      completed: true,
      timeFinished: serverTimestamp(),
      ...runScores,
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
    }).then(() => {
      this.user.updateFirestoreTimestamp();
    });
  }
}
