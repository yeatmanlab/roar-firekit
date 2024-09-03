import { DocumentReference } from 'firebase/firestore';
import { RoarRun, RunInput, RunScores } from './run';
import { RoarTaskVariant } from './task';
import { RoarAppUser } from './user';
import { OrgLists } from '../../interfaces';

export class OfflineRun extends RoarRun {
  parentUser?: RoarAppUser;
  /** Create a ROAR run
   * @param {RunInput} input
   * @param {RoarAppUser} input.user - The user running the task
   * @param {RoarTaskVariant} input.task - The task variant being run
   * @param {OrgLists} input.assigningOrgs - The IDs of the orgs to which this run belongs
   * @param {OrgLists} input.readOrgs - The IDs of the orgs which can read this run
   * @param {string} input.assignmentId = The ID of the assignment
   * @param {string} input.runId = The ID of the run. If undefined, a new run will be created.
   * @param {string} input.testData = Boolean flag indicating test data
   * @param {string} input.demoData = Boolean flag indicating demo data
   */
  constructor({
    user,
    task,
    assigningOrgs,
    readOrgs,
    assignmentId,
    runId,
    testData = false,
    demoData = false,
    parentUser,
  }: RunInput) {;
    super({user, task, assigningOrgs, readOrgs, assignmentId, runId, testData, demoData})
    this.parentUser = parentUser;
  }
  // class should hold parent uid
  // write trials to admin user's user collection instead
}
