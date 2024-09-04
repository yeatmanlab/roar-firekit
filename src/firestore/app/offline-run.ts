import { arrayUnion, collection, doc, DocumentReference, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { RoarRun, RunInput, RunScores } from './run';
import { RoarTaskVariant } from './task';
import { RoarAppUser } from './user';
import { OrgLists } from '../../interfaces';
import _intersection from 'lodash/intersection';
import _mapValues from 'lodash/mapValues';
import _pick from 'lodash/pick';
import _set from 'lodash/set';
import { removeUndefined } from '../util';

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

    // set runRef to parent user's userRun collection
    if(runId) {
        // this.runRef = this.parentUser?.userRef.collection('userRuns').doc(user.userRef).collection('runs').doc(runId);   
        this.runRef = doc(this.parentUser!.userRef, 'runs', runId);
        // this.runRef = this.parentUser?.userRef.doc(runId);   
    }
    else {
        this.runRef = doc(collection(this.parentUser!.userRef, 'runs'));
        // this.runRef = this.parentUser?.userRef.collection('userRuns').doc(user.userRef).collection('runs').doc();
    }
  }

    /**
   * Create a new run on Firestore
   * @method
   * @async
   */
    async startRun(additionalRunMetadata?: { [key: string]: unknown }) {
        // Commented out: the user does not need to exist for run to be written
        // await this.user.checkUserExists();
    
        if (!this.task.variantRef) {
          await this.task.toFirestore();
        }
    
        const userDocSnap = await getDoc(this.user.userRef);
        if (!userDocSnap.exists()) {
          // This should never happen because of ``this.user.checkUserExists`` above. But just in case:
          throw new Error('User does not exist');
        }
    
        if (this.assigningOrgs) {
          const userDocData = userDocSnap.data();
          const userOrgs = _pick(userDocData, Object.keys(this.assigningOrgs));
          for (const orgName of Object.keys(userOrgs)) {
            this.assigningOrgs[orgName] = _intersection(userOrgs[orgName]?.current, this.assigningOrgs[orgName]);
            if (this.readOrgs) {
              this.readOrgs[orgName] = _intersection(userOrgs[orgName]?.current, this.readOrgs[orgName]);
            }
          }
        }
    
        const userDocData = _pick(userDocSnap.data(), [
          'grade',
          'assessmentPid',
          'assessmentUid',
          'birthMonth',
          'birthYear',
          'schoolLevel',
        ]);
    
        // Grab the testData and demoData flags from the user document.
        const { testData: isTestUser, demoData: isDemoUser } = userDocSnap.data();
        const isTestTask = this.task.testData.task;
        const isDemoTask = this.task.demoData.task;
        const isTestVariant = this.task.testData.variant;
        const isDemoVariant = this.task.demoData.variant;
    
        // Update testData and demoData for this instance based on the test/demo
        // flags for the user and task.
        // Explanation: The constructor input flags could be passed in for a normal
        // (non-test) user who is just taking a test assessment. But if the entire user
        // is a test or demo user, then we want those flags to propagate to ALL
        // of their runs, regardless of what the constructor input flags were.
        // Likewise for the test and demo flags for the task.
        // We also want to update the internal state because we will use it later in
        // the `writeTrial` method.
        if (isTestUser || isTestTask || isTestVariant) this.testData = true;
        if (isDemoUser || isDemoTask || isDemoVariant) this.demoData = true;
    
        const runData = {
          ...additionalRunMetadata,
          id: this.runRef.id,
          assignmentId: this.assignmentId ?? null,
          assigningOrgs: this.assigningOrgs ?? null,
          readOrgs: this.readOrgs ?? null,
          taskId: this.task.taskId,
          taskVersion: this.task.taskVersion,
          variantId: this.task.variantId,
          completed: false,
          timeStarted: serverTimestamp(),
          timeFinished: null,
          reliable: false,
          userData: userDocData,
          // Use conditional spreading to add the testData flag only if it exists on
          // the userDoc and is true.
          // Explaination: We use the && operator to return the object only when
          // condition is true. If the object is returned then it will be spread
          // into runData.
          ...(this.testData && { testData: true }),
          // Same for demoData
          ...(this.demoData && { demoData: true }),
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


  // class should hold parent uid
  // write trials to admin user's user collection instead
}
