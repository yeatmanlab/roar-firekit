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

export interface IName {
  first: string;
  middle?: string;
  last: string;
}

export interface IUserData extends DocumentData {
  id?: string;
  userType: UserType;
  name?: IName;
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
  groups: IOrgs;
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
  groups: string[];
  families: string[];
}

export type OrgListKey = 'districts' | 'schools' | 'classes' | 'groups' | 'families';

export interface IAdministrationData extends IOrgLists {
  id?: string;
  name: string;
  createdBy: string;
  dateCreated: Date;
  dateOpened: Date;
  dateClosed: Date;
  sequential: boolean;
  assessments: IAssessmentData[];
  readOrgs?: IOrgLists;
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
  assignmentId?: string;
  completed: boolean;
  started: boolean;
  dateAssigned: Date;
  dateOpened: Date;
  dateClosed: Date;
  assigningOrgs: IOrgLists;
  readOrgs: IOrgLists;
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

export interface IGroup extends DocumentData {
  name: string;
  [x: string]: unknown;
}

export type IOrg = IDistrict | ISchool | IClass | IFamily | IGroup;

export type OrgType = 'district' | 'school' | 'class' | 'family' | 'group';
export type OrgCollectionName = 'districts' | 'schools' | 'classes' | 'families' | 'groups';
