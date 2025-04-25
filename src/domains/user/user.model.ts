import { DocumentData } from 'firebase/firestore';
import { UserType } from '../../interfaces';

/**
 * Base interface for user information
 */
export interface IUserInfo {
  roarUid?: string;
  assessmentUid: string;
  assessmentPid?: string;
  userType?: UserType;
  userMetadata?: { [key: string]: unknown };
  testData?: boolean;
  demoData?: boolean;
  offlineEnabled?: boolean;
  offlineTasks?: string[];
  offlineAdministrations?: string[];
}

/**
 * Interface for updating user data
 */
export interface IUserUpdateInput {
  /** These are keys that all users can update */
  tasks?: string[];
  variants?: string[];
  /** And these are keys that only guest users will be able to create/update */
  assessmentPid?: string;
  [key: string]: unknown;
}

/**
 * Interface representing a user in the ROAR system
 */
export interface IUser extends IUserInfo {
  onFirestore?: boolean;
  userData?: DocumentData;
}
