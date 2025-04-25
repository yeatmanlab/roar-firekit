import {
  DocumentData,
  DocumentReference,
  Firestore,
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import _extend from 'lodash/extend';
import { UserType } from '../../interfaces';
import { removeUndefined } from '../util';
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

/** This interface holds data that the user can update on Firestore */
interface FirestoreUserUpdate {
  /** These are keys that all users can update */
  tasks?: ReturnType<typeof arrayUnion>;
  variants?: ReturnType<typeof arrayUnion>;
  lastUpdated?: ReturnType<typeof serverTimestamp>;
  /** And these are keys that only guest users will be able to create/update */
  assessmentPid?: string;
  [key: string]: unknown;
}

/** Class representing a ROAR user */
export class RoarAppUser extends RoarAppUserAdapter {
}
