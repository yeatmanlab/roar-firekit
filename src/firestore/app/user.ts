import {
  DocumentReference,
  Firestore,
  FirestoreError,
  arrayUnion,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import _union from 'lodash/union';
import { UserType } from '../interfaces';
import { removeNull } from '../util';

export interface IAppUserData {
  assessmentPid: string;
  birthMonth?: number | null;
  birthYear?: number | null;
  classIds?: string[] | null;
  classes?: string[] | null;
  schoolId?: string | null;
  schools?: string[] | null;
  districtId?: string | null;
  districts?: string[] | null;
  studies?: string[] | null;
  families?: string[] | null;
  userType?: UserType;
  userMetadata?: Record<string, unknown>;
}

export interface IUserInput extends IAppUserData {
  assessmentUid: string;
  roarUid: string;
  db: Firestore;
}

interface IFirestoreUserData {
  assessmentPid: string;
  assessmentUid: string;
  birthMonth?: number | null;
  birthYear?: number | null;
  classIds?: ReturnType<typeof arrayUnion>;
  classes?: ReturnType<typeof arrayUnion>;
  schoolId?: string | null;
  schools?: ReturnType<typeof arrayUnion>;
  districtId?: string | null;
  districts?: ReturnType<typeof arrayUnion>;
  studies?: ReturnType<typeof arrayUnion>;
  families?: ReturnType<typeof arrayUnion>;
  userType: UserType;
  lastUpdated: ReturnType<typeof serverTimestamp>;
}

/** Class representing a ROAR user */
export class RoarAppUser {
  db: Firestore;
  roarUid: string;
  assessmentUid: string;
  assessmentPid: string;
  birthMonth: number | null;
  birthYear: number | null;
  classIds: string[] | null;
  classes: string[] | null;
  schoolId: string | null;
  schools: string[] | null;
  districtId: string | null;
  districts: string[] | null;
  studies: string[] | null;
  families: string[] | null;
  userType: UserType;
  isPushedToFirestore: boolean;
  userRef: DocumentReference;
  userMetadata: Record<string, unknown>;
  /** Create a ROAR user
   * @param {object} input
   * @param {Firestore} input.db - The assessment Firestore instance to which this user's data will be written
   * @param {string} input.roarUid - The ROAR ID of the user
   * @param {string} input.assessmentUid - The assessment firebase UID of the user
   * @param {string} input.assessmentPid - The assessment PID of the user
   * @param {number} input.birthMonth - The birth month of the user
   * @param {number} input.birthYear - The birth year of the user
   * @param {string[]} input.classIds - The current class IDs of the user
   * @param {string[]} input.classes - All previous and current class IDs of the user
   * @param {string} input.schoolId - The current school ID of the user
   * @param {string[]} input.schools - All previous and current school IDs of the user
   * @param {string} input.districtId - The current district ID of the user
   * @param {string[]} input.districts - All previous and current district IDs of the user
   * @param {string[]} input.studies - All previous and current study IDs of the user
   * @param {string[]} input.families - All previous and current family IDs of the user
   * @param {string} input.userType - The user type. Must be either 'admin', 'educator', 'student', 'caregiver', 'guest', or 'researcher.'
   * @param {*} input.userMetadata - An object containing additional user metadata
   */
  constructor({
    db,
    roarUid,
    assessmentUid,
    assessmentPid,
    birthMonth = null,
    birthYear = null,
    classIds = null,
    classes = null,
    schoolId = null,
    schools = null,
    districtId = null,
    districts = null,
    studies = null,
    families = null,
    userType = UserType.student,
    userMetadata = {},
  }: IUserInput) {
    const allowedUserCategories = Object.values(UserType);
    if (!allowedUserCategories.includes(userType)) {
      throw new Error(`User category must be one of ${allowedUserCategories.join(', ')}.`);
    }

    this.db = db;
    this.roarUid = roarUid;
    this.assessmentPid = assessmentPid;
    this.assessmentUid = assessmentUid;
    this.birthMonth = birthMonth;
    this.birthYear = birthYear;
    this.classIds = classIds;
    this.classes = classes;
    this.schoolId = schoolId;
    this.schools = schools;
    this.districtId = districtId;
    this.districts = districts;
    this.studies = studies;
    this.families = families;
    this.userType = userType;
    this.userMetadata = userMetadata;

    this.userRef = doc(this.db, 'users', this.roarUid);
    this.isPushedToFirestore = false;
  }

  /**
   * Push the user to Firestore
   * @method
   * @async
   */
  async toAppFirestore() {
    const userData: IFirestoreUserData = {
      assessmentUid: this.assessmentUid,
      assessmentPid: this.assessmentPid,
      birthMonth: this.birthMonth,
      birthYear: this.birthYear,
      schoolId: this.schoolId,
      districtId: this.districtId,
      userType: this.userType,
      lastUpdated: serverTimestamp(),
    };

    // Ensure that districts contains districtId, and likewise for schools and classes.
    const districts = _union(this.districts, [this.districtId]);
    const schools = _union(this.schools, [this.schoolId]);
    const classes = _union(this.classes, this.classIds);

    // If studies, districts, schools, classes, or families are provided, append them to
    // the list that is already in Firestore.
    if (districts) userData.districts = arrayUnion(...districts);
    if (schools) userData.schools = arrayUnion(...schools);
    if (classes) userData.classes = arrayUnion(...classes);
    if (this.classIds) userData.classIds = arrayUnion(...this.classIds);
    if (this.families) userData.families = arrayUnion(...this.families);
    if (this.studies) userData.studies = arrayUnion(...this.studies);

    return updateDoc(
      this.userRef,
      removeNull({
        ...userData,
        ...this.userMetadata,
      }),
    )
      .catch((error: FirestoreError) => {
        const errorCode = error.code;
        if (errorCode === 'not-found') {
          // We attempted to update a document that does not exist.
          // Try again using setDoc but this time also append a ``createdAt`` field.
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return setDoc(this.userRef!, {
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

  /**
   * Update the user's "lastUpdated" timestamp
   * @method
   * @async
   */
  async updateFirestoreTimestamp() {
    updateDoc(this.userRef, {
      lastUpdated: serverTimestamp(),
    });
  }
}
