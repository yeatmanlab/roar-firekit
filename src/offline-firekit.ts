import { RoarAppUser } from '@bdelab/roar-firekit';
import { RoarFirekit } from './firekit';
import { getTaskAndVariant } from './firestore/query-assessment';
import { RoarAppkit } from './firestore/app/appkit';
import { doc, runTransaction } from 'firebase/firestore';
import { Assessment, AssignedAssessment } from './interfaces';
import { UserInput } from './firestore/app/user';
import { OfflineAppKit } from './firestore/app/offline-appkit';

// TODO: See if I can create a variant of the ROAR firekit class where trials are written
// to the admin user's object instead of the target user's trials
// this schema might look something like this
// offline_admin_user : {
//  offline_run_data: {
//    user1: {
//      trials...
//    },
//    user2: {
//      trials...
//    },
//    user3: {
//      trials...
//    },
//  }
// }

export class OfflineFirekit extends RoarFirekit {
  // takes in a username (or null) and returns a ROARAppUseusername (or null). If null, returns auto generated user
  /**
   *
   * @param studentUsername
   */
  async createNewParticipant(studentUsername: string) {}

  /**
   this function would take in a new parameter, "participant" as the user that is currently
  taking the assessment but not authenticated in
   * 
   * @param administrationId 
   * @param taskId 
   * @param taskVersion 
   * @param participant 
   * @returns 
   */
  async startAssessmentForTargetParticipant(
    administrationId: string,
    taskId: string,
    taskVersion: string,
    participant: UserInput,
  ) {
    this._verifyAuthentication();

    const appKit = await runTransaction(this.admin!.db, async (transaction) => {
      // First grab data about the administration
      const administrationDocRef = doc(this.admin!.db, 'administrations', administrationId);
      const administrationDocSnap = await transaction.get(administrationDocRef);
      if (administrationDocSnap.exists()) {
        let assessmentParams: { [x: string]: unknown } = {};
        const assessments: Assessment[] = administrationDocSnap.data().assessments;
        const thisAssessment = assessments.find((a) => a.taskId === taskId);
        if (thisAssessment) {
          assessmentParams = thisAssessment.params;
        } else {
          throw new Error(`Could not find assessment with taskId ${taskId} in administration ${administrationId}`);
        }

        // Check the assignment to see if none of the assessments have been
        // started yet. If not, start the assignment
        const assignmentDocRef = doc(this.dbRefs!.admin.assignments, administrationId);
        const assignmentDocSnap = await transaction.get(assignmentDocRef);
        if (assignmentDocSnap.exists()) {
          const assignedAssessments = assignmentDocSnap.data().assessments as AssignedAssessment[];
          const assessmentUpdateData = {
            startedOn: new Date(),
          };

          // Append runId to `allRunIds` for this assessment
          // in the userId/assignments collection
          await this._updateAssignedAssessment(administrationId, taskId, assessmentUpdateData, transaction);

          if (!assignedAssessments.some((a: AssignedAssessment) => Boolean(a.startedOn))) {
            await this.startAssignment(administrationId, transaction);
          }

          if (this.roarAppUserInfo === undefined) {
            await this.getMyData();
          }

          const assigningOrgs = assignmentDocSnap.data().assigningOrgs;
          const readOrgs = assignmentDocSnap.data().readOrgs;
          const taskAndVariant = await getTaskAndVariant({
            db: this.app!.db,
            taskId,
            variantParams: assessmentParams,
          });
          if (taskAndVariant.task === undefined) {
            throw new Error(`Could not find task ${taskId}`);
          }

          if (taskAndVariant.variant === undefined) {
            throw new Error(
              `Could not find a variant of task ${taskId} with the params: ${JSON.stringify(assessmentParams)}`,
            );
          }

          const taskName = taskAndVariant.task.name;
          const taskDescription = taskAndVariant.task.description;
          const variantName = taskAndVariant.variant.name;
          const variantDescription = taskAndVariant.variant.description;

          const { testData: isAssignmentTest, demoData: isAssignmentDemo } = assignmentDocSnap.data();
          const { testData: isUserTest, demoData: isUserDemo } = this.roarAppUserInfo!;
          const { testData: isTaskTest, demoData: isTaskDemo } = taskAndVariant.task;
          const { testData: isVariantTest, demoData: isVariantDemo } = taskAndVariant.variant;

          const taskInfo = {
            db: this.app!.db,
            taskId,
            taskName,
            taskDescription,
            taskVersion,
            variantName,
            variantDescription,
            variantParams: assessmentParams,
            testData: {
              task: isTaskTest ?? false,
              variant: isVariantTest ?? false,
            },
            demoData: {
              task: isTaskDemo ?? false,
              variant: isVariantDemo ?? false,
            },
          };

          // TODO: use target participant user info instead of the default
          // This would allow an admin user to launch another user into
          return new OfflineAppKit({
            firebaseProject: this.app,
            userInfo: participant,
            assigningOrgs,
            readOrgs,
            assignmentId: administrationId,
            taskInfo,
            testData: {
              user: isUserTest,
              task: isTaskTest,
              variant: isVariantTest,
              run: isAssignmentTest || isUserTest || isTaskTest || isVariantTest,
            },
            demoData: {
              user: isUserDemo,
              task: isTaskDemo,
              variant: isVariantDemo,
              run: isAssignmentDemo || isUserDemo || isTaskDemo || isVariantDemo,
            },
            // parentUser: this.roarAppUser,
          });
        } else {
          throw new Error(
            `Could not find assignment for user ${this.roarUid} with administration id ${administrationId}`,
          );
        }
      } else {
        throw new Error(`Could not find administration with id ${administrationId}`);
      }
    });

    return appKit;
  }
}
