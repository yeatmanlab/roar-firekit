import {
  arrayUnion,
  doc,
  DocumentReference,
  FirestoreError,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { removeNull } from './util';

export type userCategoryType = 'student' | 'educator' | 'researcher' | 'admin' | 'caregiver';

export interface IUserData {
  id: string;
  birthMonth?: number | null;
  birthYear?: number | null;
  classId?: string | null;
  schoolId?: string | null;
  districtId?: string | null;
  studyId?: string | null;
  userCategory?: userCategoryType;
  userMetadata?: Record<string, unknown>;
}

export interface IUserInput extends IUserData {
  firebaseUid: string;
}

interface IFirestoreUserData {
  id: string;
  firebaseUid: string;
  birthMonth?: number | null;
  birthYear?: number | null;
  classId?: string | null;
  schoolId?: string | null;
  districtId?: string | null;
  studyId?: string | null;
  userCategory: userCategoryType;
  lastUpdated: ReturnType<typeof serverTimestamp>;
  studies?: ReturnType<typeof arrayUnion>;
  districts?: ReturnType<typeof arrayUnion>;
  schools?: ReturnType<typeof arrayUnion>;
  classes?: ReturnType<typeof arrayUnion>;
}

/** Class representing a ROAR user */
export class RoarUser {
  /** Create a ROAR user
   * @param {string} id - The ROAR ID of the user
   * @param {string} firebaseUid - The firebase UID of the user
   * @param {number} birthMonth - The birth month of the user
   * @param {number} birthYear - The birth year of the user
   * @param {string} classId - The class ID of the user
   * @param {string} schoolId - The school ID of the user
   * @param {string} districtId - The district ID of the user
   * @param {string} studyId - The study ID of the user
   * @param {string} userCategory - The user type. Must be either "student," "educator," or "researcher"
   * @param {*} userMetadata - An object containing additional user metadata
   */
  id: string;
  firebaseUid: string;
  birthMonth: number | null;
  birthYear: number | null;
  classId: string | null;
  schoolId: string | null;
  districtId: string | null;
  studyId: string | null;
  userCategory: userCategoryType;
  isPushedToFirestore: boolean;
  assessmentDocRef: DocumentReference | undefined;
  adminDocRef: DocumentReference | undefined;
  userMetadata: Record<string, unknown>;
  constructor({
    id,
    firebaseUid,
    birthMonth = null,
    birthYear = null,
    classId = null,
    schoolId = null,
    districtId = null,
    studyId = null,
    userCategory = 'student' as const,
    userMetadata = {},
  }: IUserInput) {
    const allowedUserCategories: string[] = ['student', 'educator', 'researcher', 'admin', 'caregiver'];
    if (!allowedUserCategories.includes(userCategory)) {
      throw new Error(`User category must be one of ${allowedUserCategories.join(', ')}.`);
    }

    this.id = id;
    this.firebaseUid = firebaseUid;
    this.birthMonth = birthMonth;
    this.birthYear = birthYear;
    this.classId = classId;
    this.schoolId = schoolId;
    this.districtId = districtId;
    this.studyId = studyId;
    this.userCategory = userCategory as userCategoryType;
    this.userMetadata = userMetadata;

    this.assessmentDocRef = undefined;
    this.adminDocRef = undefined;
    this.isPushedToFirestore = false;
  }

  /** Set Firestore doc references
   * @param {DocumentReference} rootDoc - The root document reference
   */
  setRefs(rootDoc: DocumentReference) {
    this.assessmentDocRef = doc(rootDoc, 'users', this.id);
    this.adminDocRef = doc('users', this.id);
  }

  /**
   * Push the user to Firestore
   * @method
   * @async
   */
  async toFirestore() {
    if (this.assessmentDocRef === undefined) {
      throw new Error('User refs not set. Please use the setRefs method first.');
    } else {
      const userData: IFirestoreUserData = {
        id: this.id,
        firebaseUid: this.firebaseUid,
        birthMonth: this.birthMonth,
        birthYear: this.birthYear,
        classId: this.classId,
        schoolId: this.schoolId,
        districtId: this.districtId,
        studyId: this.studyId,
        userCategory: this.userCategory,
        lastUpdated: serverTimestamp(),
      };

      // If the study, district, school, or class is provided, also add it to the
      // list of all studies, districts, schools, or classes.
      // Likewise for task and variant.
      if (this.studyId) userData.studies = arrayUnion(this.studyId);
      if (this.districtId) userData.districts = arrayUnion(this.districtId);
      if (this.schoolId) userData.schools = arrayUnion(this.schoolId);
      if (this.classId) userData.classes = arrayUnion(this.classId);

      return updateDoc(this.assessmentDocRef, removeNull(userData))
        .catch((error: FirestoreError) => {
          const errorCode = error.code;
          if (errorCode === 'permission-denied') {
            // The ROAR Firestore rules are written such that if we get here, the
            // user does not currently exist in Firestore. So create them.
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return setDoc(this.assessmentDocRef!, {
              ...userData,
              ...this.userMetadata,
              createdAt: serverTimestamp(),
            });
          } else {
            throw error;
          }
        })
        .then(() => {
          this.isPushedToFirestore = true;
        });
    }
  }

  /**
   * Update the user's "lastUpdated" timestamp
   * @method
   * @async
   */
  async updateFirestoreTimestamp() {
    if (this.assessmentDocRef === undefined) {
      throw new Error('User refs not set. Please use the setRefs method first.');
    } else {
      updateDoc(this.assessmentDocRef, {
        lastUpdated: serverTimestamp(),
      });
    }
  }
}
