import { onAuthStateChanged } from "firebase/auth";
import { AppkitInput, RoarAppkit } from "./appkit";
import { RoarAppUser } from "./user";
import { OfflineRun } from "./offline-run";
import { RoarTaskVariant } from "./task";
import { initializeFirebaseProject } from "../util";
import { getDownloadURL, ref } from "firebase/storage";

export class OfflineAppKit extends RoarAppkit {
    parentUser?: RoarAppUser
    // TODO: find out what functions i need to override with this class
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
    parentUser,
  }: AppkitInput) {
      super({firebaseProject, firebaseConfig, userInfo, taskInfo, assigningOrgs, readOrgs, assignmentId, runId, testData, demoData});
      this.parentUser = parentUser;
    }

    protected async _init () {
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
          this.run = new OfflineRun({
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

    async startRun(additionalRunMetadata?: { [key: string]: unknown }): Promise<boolean> {
        console.log("start run called in offline appkitinit")
        if (!this._initialized) {
            await this._init();
          }
      
          if (!this.authenticated) {
            throw new Error('User must be authenticated to start a run.');
          }
      
          return this.run!.startRun(additionalRunMetadata).then(() => (this._started = true));
    }

}