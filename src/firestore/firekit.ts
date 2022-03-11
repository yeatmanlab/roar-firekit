import { DocumentReference } from 'firebase/firestore';
import { UserInput, RoarUser } from './user';
import { TaskVariantInput, RoarTaskVariant } from './task';
import { RunInput, RoarRun } from './run';

/** Class with factory methods to produce ROAR objects with root Doc already set */
export class RoarFireKit {
  rootDoc: DocumentReference;
  /** Create a ROAR run
   * @param {DocumentReference} rootDoc - The root document reference
   */
  constructor(rootDoc: DocumentReference) {
    this.rootDoc = rootDoc;
  }

  /** Create a ROAR user
   * @param {string} id - The ROAR ID of the user
   * @param {string} firebaseUid - The firebase UID of the user
   * @param {string} taskId - The ID of the task the user is currently working on
   * @param {string} variantId - The ID of the task variant the user is currently working on
   * @param {number} birthMonth - The birth month of the user
   * @param {number} birthYear - The birth year of the user
   * @param {string} classId - The class ID of the user
   * @param {string} schoolId - The school ID of the user
   * @param {string} districtId - The district ID of the user
   * @param {string} studyId - The study ID of the user
   * @param {string} userCategory - The user type. Must be either "student," "educator," or "researcher"
   */
  createUser({
    id,
    firebaseUid,
    birthMonth = null,
    birthYear = null,
    classId = null,
    schoolId = null,
    districtId = null,
    studyId = null,
    userCategory = 'student',
  }: UserInput) {
    const user = new RoarUser({
      id,
      firebaseUid,
      birthMonth,
      birthYear,
      classId,
      schoolId,
      districtId,
      studyId,
      userCategory,
    });
    user.setRefs(this.rootDoc);
    return user;
  }

  /** Create a ROAR task
   * @param {string} taskId - The ID of the parent task. Should be a short initialism, e.g. "swr" or "srf"
   * @param {string} taskName - The name of the parent task
   * @param {string} taskDescription - The description of the task
   * @param {string} variantName - The name of the task variant
   * @param {string} variantDescription - The description of the variant
   * @param {Array} blocks - The blocks of this task variant
   */
  createTask({
    taskId,
    taskName,
    variantName,
    taskDescription = null,
    variantDescription = null,
    blocks = [],
  }: TaskVariantInput) {
    const taskVariant = new RoarTaskVariant({
      taskId,
      taskName,
      variantName,
      taskDescription,
      variantDescription,
      blocks,
    });
    taskVariant.setRefs(this.rootDoc);
    return taskVariant;
  }

  /** Create a ROAR run
   * @param {RoarUser} user - The user running the task
   * @param {RoarTaskVariant} task - The task variant being run
   */
  createRun({ user, task }: RunInput) {
    return new RoarRun({ user, task });
  }
}

export const initRoarFireKit = (rootDoc: DocumentReference) => {
  return new RoarFireKit(rootDoc);
};
