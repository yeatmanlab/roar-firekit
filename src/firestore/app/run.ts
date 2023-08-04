import {
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
import _mapValues from 'lodash/mapValues';
import _pick from 'lodash/pick';
import _set from 'lodash/set';
import dot from 'dot-object';
import { RoarTaskVariant } from './task';
import { RoarAppUser } from './user';
import { IOrgLists } from '../interfaces';
import { removeUndefined } from '../util';
import { FirebaseError } from '@firebase/util';

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
  return removeUndefined(
    Object.fromEntries(
      Object.entries(trialData).map(([key, value]) => {
        if (value instanceof URL) {
          return [key, value.toString()];
        } else if (typeof value === 'object' && value !== null) {
          return [key, convertTrialToFirestore(value)];
        } else {
          return [key, value];
        }
      }),
    ),
  );
};

const requiredTrialFields = ['assessment_stage', 'correct'];

interface ISummaryScores {
  thetaEstimate: number | null;
  thetaSE: number | null;
  numAttempted: number;
  numCorrect: number;
  numIncorrect: number;
}

export interface IRawScores {
  [key: string]: {
    practice: ISummaryScores;
    test: ISummaryScores;
  };
}

export interface IComputedScores {
  [key: string]: unknown;
}

export interface IRunScores {
  raw: IRawScores;
  computed: IComputedScores;
}

export interface IRunInput {
  user: RoarAppUser;
  task: RoarTaskVariant;
  assigningOrgs?: IOrgLists;
  runId?: string;
}

interface IScoreUpdate {
  [key: string]: number | FieldValue | null | undefined;
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
  scores: IRunScores;
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

    this.scores = {
      raw: {},
      computed: {},
    };
  }

  /**
   * Create a new run on Firestore
   * @method
   * @async
   */
  async startRun(additionalRunMetadata?: { [key: string]: unknown }) {
    await this.user.checkUserExists();

    if (!this.task.variantRef) {
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
      completed: false,
      timeStarted: serverTimestamp(),
      timeFinished: null,
    };

    await setDoc(this.runRef, removeUndefined(runData))
      .then(() => {
        return updateDoc(this.user.userRef, {
          tasks: arrayUnion(this.task.taskId),
          variants: arrayUnion(this.task.variantId),
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
  async writeTrial(
    trialData: Record<string, unknown>,
    computedScoreCallback?: (rawScores: IRawScores) => Promise<IComputedScores>,
  ) {
    if (!this.started) {
      throw new Error('Run has not been started yet. Use the startRun method first.');
    }

    // Check that the trial has all of the required reserved keys
    if (!requiredTrialFields.every((key) => key in trialData)) {
      throw new Error(
        'All ROAR trials saved to Firestore must have the following reserved keys: ' +
          `${requiredTrialFields}.` +
          'The current trial is missing the following required keys: ' +
          `${requiredTrialFields.filter((key) => !(key in trialData))}.`,
      );
    }

    const trialRef = doc(collection(this.runRef, 'trials'));

    return setDoc(trialRef, {
      ...convertTrialToFirestore(trialData),
      serverTimestamp: serverTimestamp(),
    })
      .then(async () => {
        // Only update scores if the trial was a test or a practice response.
        if (trialData.assessment_stage === 'test_response' || trialData.assessment_stage === 'practice_response') {
          // Here we update the scores for this run. We create scores for each subtask in the task.
          // E.g., ROAR-PA has three subtasks: FSM, LSM, and DEL. Each subtask has its own score.
          // Conversely, ROAR-SWR has no subtasks. It's scores are stored in the 'total' score field.
          // If no subtask is specified, the scores for the 'total' subtask will be updated.
          const defaultSubtask = 'composite';
          const subtask = (trialData.subtask || defaultSubtask) as string;

          const stage = trialData.assessment_stage.split('_')[0] as 'test' | 'practice';

          let scoreUpdate: IScoreUpdate = {};
          if (subtask in this.scores.raw) {
            // Then this subtask has already been added to this run.
            // Simply update the block's scores.
            this.scores.raw[subtask][stage] = {
              thetaEstimate: (trialData.thetaEstimate as number) || null,
              thetaSE: (trialData.thetaSE as number) || null,
              numAttempted: (this.scores.raw[subtask][stage]?.numAttempted || 0) + 1,
              // For the next two, use the unary + operator to convert the boolean value to 0 or 1.
              numCorrect: (this.scores.raw[subtask][stage]?.numCorrect || 0) + +Boolean(trialData.correct),
              numIncorrect: (this.scores.raw[subtask][stage]?.numIncorrect || 0) + +!trialData.correct,
            };

            // And populate the score update for Firestore.
            scoreUpdate = {
              [`scores.raw.${subtask}.${stage}.thetaEstimate`]: (trialData.thetaEstimate as number) || null,
              [`scores.raw.${subtask}.${stage}.thetaSE`]: (trialData.thetaSE as number) || null,
              [`scores.raw.${subtask}.${stage}.numAttempted`]: increment(1),
              [`scores.raw.${subtask}.${stage}.numCorrect`]: trialData.correct ? increment(1) : undefined,
              [`scores.raw.${subtask}.${stage}.numIncorrect`]: trialData.correct ? undefined : increment(1),
            };

            if (subtask !== defaultSubtask) {
              this.scores.raw[defaultSubtask][stage] = {
                numAttempted: (this.scores.raw[defaultSubtask][stage]?.numAttempted || 0) + 1,
                // For the next two, use the unary + operator to convert the boolean value to 0 or 1.
                numCorrect: (this.scores.raw[defaultSubtask][stage]?.numCorrect || 0) + +Boolean(trialData.correct),
                numIncorrect: (this.scores.raw[defaultSubtask][stage]?.numIncorrect || 0) + +!trialData.correct,
                thetaEstimate: null,
                thetaSE: null,
              };

              scoreUpdate = {
                ...scoreUpdate,
                [`scores.raw.${defaultSubtask}.${stage}.numAttempted`]: increment(1),
                [`scores.raw.${defaultSubtask}.${stage}.numCorrect`]: trialData.correct ? increment(1) : undefined,
                [`scores.raw.${defaultSubtask}.${stage}.numIncorrect`]: trialData.correct ? undefined : increment(1),
              };
            }
          } else {
            // This is the first time this subtask has been added to this run.
            // Initialize the subtask scores.
            _set(this.scores.raw, [subtask, stage], {
              thetaEstimate: (trialData.thetaEstimate as number) || null,
              thetaSE: (trialData.thetaSE as number) || null,
              numAttempted: 1,
              numCorrect: trialData.correct ? 1 : 0,
              numIncorrect: trialData.correct ? 0 : 1,
            });

            // And populate the score update for Firestore.
            scoreUpdate = {
              [`scores.raw.${subtask}.${stage}.thetaEstimate`]: (trialData.thetaEstimate as number) || null,
              [`scores.raw.${subtask}.${stage}.thetaSE`]: (trialData.thetaSE as number) || null,
              [`scores.raw.${subtask}.${stage}.numAttempted`]: 1,
              [`scores.raw.${subtask}.${stage}.numCorrect`]: trialData.correct ? 1 : 0,
              [`scores.raw.${subtask}.${stage}.numIncorrect`]: trialData.correct ? 0 : 1,
            };

            if (subtask !== defaultSubtask) {
              _set(this.scores.raw, [defaultSubtask, stage], {
                numAttempted: 1,
                numCorrect: trialData.correct ? 1 : 0,
                numIncorrect: trialData.correct ? 0 : 1,
                thetaEstimate: null,
                thetaSE: null,
              });

              scoreUpdate = {
                ...scoreUpdate,
                [`scores.raw.${defaultSubtask}.${stage}.numAttempted`]: increment(1),
                [`scores.raw.${defaultSubtask}.${stage}.numCorrect`]: trialData.correct ? increment(1) : undefined,
                [`scores.raw.${defaultSubtask}.${stage}.numIncorrect`]: trialData.correct ? undefined : increment(1),
              };
            }
          }

          if (computedScoreCallback) {
            // Use the user-provided callback to compute the computed scores.
            this.scores.computed = await computedScoreCallback(this.scores.raw);
          } else {
            // If no computedScoreCallback is provided, we default to
            // numCorrect - numIncorrect for each subtask.
            this.scores.computed = _mapValues(this.scores.raw, (subtaskScores) => {
              const numCorrect = subtaskScores.test?.numCorrect || 0;
              const numIncorrect = subtaskScores.test?.numIncorrect || 0;
              return numCorrect - numIncorrect;
            });
          }

          // And use dot-object to convert the computed scores into dotted-key/value pairs.
          // First nest the computed scores into `scores.computed` so that they get updated
          // in the correct location.
          const fullUpdatePath = {
            scores: {
              computed: this.scores.computed,
            },
          };
          scoreUpdate = {
            ...scoreUpdate,
            ...dot.dot(fullUpdatePath),
          };

          return updateDoc(this.runRef, removeUndefined(scoreUpdate)).catch((error: FirebaseError) => {
            // Catch the "Unsupported field value: undefined" error and
            // provide a more helpful error message to the ROAR app developer.
            if (error.message.toLowerCase().includes('unsupported field value: undefined')) {
              throw new Error(
                'The computed or normed scores that you provided contained an undefined value. ' +
                  'Firestore does not support storing undefined values. ' +
                  'Please remove this value or convert it to ``null``.',
              );
            }
            throw error;
          });
        }
      })
      .then(() => {
        this.user.updateFirestoreTimestamp();
      });
  }
}
