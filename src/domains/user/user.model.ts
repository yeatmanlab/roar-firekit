/**
 * Enum representing the types of users in the ROAR system
 */
export enum UserType {
  admin = 'admin',
  educator = 'educator',
  student = 'student',
  caregiver = 'caregiver',
  guest = 'guest',
  researcher = 'researcher',
}

/**
 * Base interface for user data
 */
export interface UserData {
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
  /** Tasks associated with the user */
  tasks?: string[];
  /** Variants associated with the user */
  variants?: string[];
  /** Timestamp when the user was last updated */
  lastUpdated?: Date;
  /** Timestamp when the user was created */
  created?: Date;
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
export interface User extends UserData {
  /** Flag indicating if the user exists in the backend */
  onBackend?: boolean;
}
