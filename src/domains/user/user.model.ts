import { UserType } from '../../interfaces';

/**
 * Base interface for user information
 */
export interface UserInfo {
  /** The ROAR user ID */
  roarUid?: string;
  /** The assessment unique identifier */
  assessmentUid: string;
  /** The assessment participant ID */
  assessmentPid?: string;
  /** The type of user (admin, educator, student, etc.) */
  userType?: UserType;
  /** Additional metadata for the user */
  userMetadata?: { [key: string]: unknown };
  /** Flag indicating if this is test data */
  testData?: boolean;
  /** Flag indicating if this is demo data */
  demoData?: boolean;
}

/**
 * Interface for updating user data
 */
export interface UserUpdateInput {
  /** The tasks to be added to the user */
  tasks?: string[];
  /** The variants to be added to the user */
  variants?: string[];
  /** The assessment participant ID (only for guest users) */
  assessmentPid?: string;
  /** Any additional fields to update */
  [key: string]: unknown;
}

/**
 * Interface representing a user in the ROAR system
 */
export interface User extends UserInfo {
  /** Flag indicating if the user exists in the backend */
  onBackend?: boolean;
  /** The user data from the backend */
  userData?: Record<string, unknown>;
}
