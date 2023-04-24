import { FirebaseApp } from 'firebase/app';
import { Auth, User } from 'firebase/auth';
import { DocumentData, Firestore } from 'firebase/firestore';
import { FirebaseConfigData } from './util';

export interface IRoarConfigData {
  app: FirebaseConfigData;
  admin: FirebaseConfigData;
}

export interface IFirekit {
  firebaseApp: FirebaseApp;
  db: Firestore;
  auth: Auth;
  user?: User;
}

type Grade = number | 'K' | 'PK' | 'TK';

export enum UserType {
  admin = 'admin',
  educator = 'educator',
  student = 'student',
  caregiver = 'caregiver',
  guest = 'guest',
}

enum AdminLevel {
  class = 'class',
  school = 'school',
  district = 'district',
  study = 'study',
}

export interface IStudentOrEducatorData extends DocumentData {
  classId: string;
  previousClassIds: string[];
  schoolId: string;
  previousSchoolIds: string[];
  districtId: string;
  studies: string[];
  previousStudies: string[];
  previousDistrictIds: string[];
  [x: string]: unknown;
}

export interface IStudentData extends IStudentOrEducatorData {
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

export interface IUserData extends DocumentData {
  userType: UserType;
  assessmentPid?: string;
  dob?: Date;
  assessmentsCompleted?: string[];
  assessmentsAssigned?: string[];
  administrationsAssigned?: string[];
  administrationsStarted?: string[];
  administrationsCompleted?: string[];
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
