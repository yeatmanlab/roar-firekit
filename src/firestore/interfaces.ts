import { FirebaseApp } from 'firebase/app';
import { Auth, User } from 'firebase/auth';
import { DocumentData, Firestore } from 'firebase/firestore';
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

type Grade = number | 'K' | 'PK' | 'TK';

export enum UserType {
  admin = 'admin',
  educator = 'educator',
  student = 'student',
  caregiver = 'caregiver',
  guest = 'guest',
  researcher = 'researcher',
}

export interface IExtraMetadata extends DocumentData {
  [x: string]: unknown;
}

export interface IStudentData extends IExtraMetadata {
  ell_status?: string;
  frl_status?: string;
  iep_status?: string;
  dob: Date;
  gender?: string;
  grade: Grade;
}

export interface IAdminData extends DocumentData {
  administrationsCreated: string[];
  permissions: string[];
}

export interface IExternalUserData extends DocumentData {
  [x: string]: unknown;
}

export interface IAssignmentDateMap {
  [x: string]: Date;
}

export interface IOrgDateMap {
  [x: string]: { from: Date; to?: Date };
}

export interface IOrgs {
  current: string[];
  all: string[];
  dates: IOrgDateMap;
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
  assignmentsAssigned?: IAssignmentDateMap;
  assignmentsStarted?: IAssignmentDateMap;
  assignmentsCompleted?: IAssignmentDateMap;
  classes: IOrgs;
  schools: IOrgs;
  districts: IOrgs;
  studies: IOrgs;
  families: IOrgs;
  archived: boolean;
  studentData?: IStudentData;
  educatorData?: IExtraMetadata;
  caregiverData?: IExtraMetadata;
  adminData?: IAdminData;
  // Allow for data from external resources like clever or state-wide tests
  externalData?: {
    [x: string]: IExternalUserData;
  };
}

export interface IAssessmentData extends DocumentData {
  taskId: string;
  params: { [x: string]: unknown };
}

export interface IOrgLists extends DocumentData {
  districts: string[];
  schools: string[];
  classes: string[];
  studies: string[];
  families: string[];
}

export interface IAdministrationData extends IOrgLists {
  createdBy: string;
  dateCreated: Date;
  dateOpened: Date;
  dateClosed: Date;
  sequential: boolean;
  assessments: IAssessmentData[];
}

export interface IAssignedAssessmentData extends DocumentData {
  taskId: string;
  runId?: string;
  allRunIds?: string[];
  completedOn?: Date;
  startedOn?: Date;
  rewardShown: boolean;
  [x: string]: unknown;
}

export interface IAssignmentData extends DocumentData {
  completed: boolean;
  started: boolean;
  dateAssigned: Date;
  dateOpened: Date;
  dateClosed: Date;
  assigningOrgs: IOrgLists;
  assessments: IAssignedAssessmentData[];
}

export interface IDistrict extends DocumentData {
  name: string;
  schools: string[];
  [x: string]: unknown;
}

export interface ISchool extends DocumentData {
  name: string;
  abbreviation: string;
  districtId: string;
  classes: string[];
  [x: string]: unknown;
}

export interface IClass extends DocumentData {
  name: string;
  schoolId: string;
  districtId: string;
  grade: Grade;
  [x: string]: unknown;
}

export interface IFamily extends DocumentData {
  [x: string]: unknown;
}

export interface IStudy extends DocumentData {
  name: string;
  [x: string]: unknown;
}

export type IOrg = IDistrict | ISchool | IClass | IFamily | IStudy;

export type OrgType = 'district' | 'school' | 'class' | 'family' | 'study';
