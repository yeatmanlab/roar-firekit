import { Auth } from 'firebase/auth';

import { RoarRun } from './run';
import { ITaskVariantInput, RoarTaskVariant } from './task';
import { IUserInput, IUserUpdateInput, RoarAppUser } from './user';
import { IOrgLists } from '../interfaces';

interface IAppkitConstructorParams {
  auth: Auth;
  userInfo: IUserInput;
  taskInfo: ITaskVariantInput;
  assigningOrgs?: IOrgLists;
  runId?: string;
}

/**
 * The RoarAppkit class is the main entry point for ROAR apps using the ROAR
 * Firestore API.  It represents multiple linked Firestore documents and
 * provides methods for interacting with them.
 */
export class RoarAppkit {
  auth: Auth;
  run: RoarRun;
  task: RoarTaskVariant;
  user: RoarAppUser;
  private _started: boolean;
  /**
   * Create a RoarAppkit.
   *
   * @param {{userInfo: IUserInput, taskInfo: ITaskVariantInput}=} input
   * @param {IUserInput} input.userInfo - The user input object
   * @param {ITaskVariantInput} input.taskInfo - The task input object
   * @param {IOrgLists} input.assigningOrgs - The ID of the study to which this run belongs
   * @param {string} input.runId = The ID of the run. If undefined, a new run will be created.
   */
  constructor({ auth, userInfo, taskInfo, assigningOrgs, runId }: IAppkitConstructorParams) {
    this.auth = auth;

    this.user = new RoarAppUser(userInfo);
    this.task = new RoarTaskVariant(taskInfo);
    this.run = new RoarRun({ user: this.user, task: this.task, assigningOrgs, runId });
    this._started = false;
  }

  get isAuthenticated(): boolean {
    return this.auth.currentUser !== null;
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
  async updateUser({ tasks, variants, assessmentPid, ...userMetadata }: IUserUpdateInput): Promise<void> {
    if (!this.isAuthenticated) {
      throw new Error('User must be authenticated to update their own data.');
    }

    return this.user.updateUser({ tasks, variants, assessmentPid, ...userMetadata });
  }

  /**
   * Start the ROAR run. Push the task and run info to Firestore.
   * Call this method before starting the jsPsych experiment.
   * @method
   * @async
   */
  async startRun(additionalRunMetadata?: { [key: string]: string }) {
    if (!this.isAuthenticated) {
      throw new Error('User must be authenticated to start a run.');
    }

    return this.run.startRun(additionalRunMetadata).then(() => (this._started = true));
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
    if (this._started) {
      return this.run.finishRun();
    } else {
      throw new Error('This run has not started. Use the startRun method first.');
    }
  }

  /**
   * Add new trial data to this run on Firestore.
   *
   * ROAR expects certain data to be added to each trial:
   * - correct: boolean, whether the correct answer was correct
   * - theta: number (optional), the ability estimate for adaptive assessments
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
  async writeTrial(trialData: Record<string, unknown>) {
    if (this._started) {
      return this.run.writeTrial(trialData);
    } else {
      throw new Error('This run has not started. Use the startRun method first.');
    }
  }
}
