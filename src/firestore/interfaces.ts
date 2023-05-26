import { FirebaseApp } from 'firebase/app';
import { Auth, User } from 'firebase/auth';
import { DocumentData, Firestore, DocumentReference } from 'firebase/firestore';
import { Functions } from 'firebase/functions';
import { FirebaseConfigData } from './util';

export interface IRoarConfigData {
  app: FirebaseConfigData;
  admin: FirebaseConfigData;
}

export interface IFirekit {
  firebaseApp: FirebaseApp;
  db: Firestore;
  auth: Auth;
  functions: Functions;
  user?: User;
  claimsLastUpdated?: Date;
}

export interface IAppFirekit extends IFirekit {
  docRefs?: {
    [key: string]: DocumentReference;
  };
}

type Grade = number | 'K' | 'PK' | 'TK';

export enum UserType {
  admin = 'admin',
  educator = 'educator',
  student = 'student',
  caregiver = 'caregiver',
  guest = 'guest',
  researcher = 'researcher',
}

enum AdminLevel {
  class = 'class',
  school = 'school',
  district = 'district',
  study = 'study',
}

export interface IStudentOrEducatorData extends DocumentData {
  classId: string;
  classes: string[];
  schoolId: string;
  schools: string[];
  districtId: string;
  districts: string[];
  studies: string[];
  [x: string]: unknown;
}

export interface IStudentData extends IStudentOrEducatorData {
  ell?: boolean;
  gender?: string;
  dob: Date;
  grade: Grade;
}

export interface IEducatorData extends IStudentOrEducatorData {
  grades: Grade[];
}

export interface ICaregiverData extends DocumentData {
  students: string[];
  [x: string]: unknown;
}

export interface IAdminData extends DocumentData {
  administrationsCreated: string[];
  permissions: string[];
  classes: string[];
  studies: string[];
  districts: string[];
  schools: string[];
  adminLevel: AdminLevel;
  [x: string]: unknown;
}

export interface IExternalUserData extends DocumentData {
  [x: string]: unknown;
}

export interface IAdministrationDateMap {
  [x: string]: Date;
}

export interface IUserData extends DocumentData {
  userType: UserType;
  name?: {
    first: string;
    last: string;
    middle?: string;
  };
  assessmentPid?: string;
  assessmentUid?: string;
  assessmentsCompleted?: string[];
  assessmentsAssigned?: string[];
  administrationsAssigned?: IAdministrationDateMap;
  administrationsStarted?: IAdministrationDateMap;
  administrationsCompleted?: IAdministrationDateMap;
  adminData?: IAdminData;
  educatorData?: IEducatorData;
  studentData?: IStudentData;
  caregiverData?: ICaregiverData;
  // Allow for data from external resources like clever or state-wide tests
  externalData?: {
    [x: string]: IExternalUserData;
  };
}

export interface IAssessmentData extends DocumentData {
  taskId: string;
  params: {
    [x: string]: unknown;
  };
}

export interface IAdministrationData extends DocumentData {
  createdBy: string;
  assignedUsers: string[];
  assignedClasses: string[];
  assignedSchools: string[];
  assignedDistricts: string[];
  assignedGrades: number[];
  dateCreated: Date;
  dateOpened: Date;
  dateClosed: Date;
  sequential: boolean;
  assessments: IAssessmentData[];
}

export interface IMyAssessmentData extends DocumentData {
  taskId: string;
  runId: string | null;
  completedOn: Date | null;
  startedOn: Date | null;
  rewardShown: boolean;
}

export interface IMyAdministrationData extends DocumentData {
  completed: boolean;
  assessments: IMyAssessmentData[];
}
