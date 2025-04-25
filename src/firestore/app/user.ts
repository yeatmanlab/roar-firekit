import { Firestore } from 'firebase/firestore';
import { UserType } from '../../interfaces';
import { RoarAppUserAdapter } from '../../domains/user/user-adapter';

export interface UserInfo {
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

export interface UserInput extends UserInfo {
  db: Firestore;
}

export interface UserUpdateInput {
  /** These are keys that all users can update */
  tasks?: string[];
  variants?: string[];
  /** And these are keys that only guest users will be able to create/update */
  assessmentPid?: string;
  [key: string]: unknown;
}


/** Class representing a ROAR user */
export class RoarAppUser extends RoarAppUserAdapter {
}
