import { DocumentData, DocumentReference } from 'firebase/firestore';
import { IUser, IUserInfo, IUserUpdateInput } from './user.model';

/**
 * Repository interface for user data access
 */
export interface IUserRepository {
  /**
   * Create a user instance
   */
  createUser(userInfo: IUserInfo): IUser;
  
  /**
   * Initialize user data from storage
   */
  initUser(user: IUser): Promise<void>;
  
  /**
   * Check if user exists in storage
   */
  checkUserExists(user: IUser): Promise<void>;
  
  /**
   * Update user data
   */
  updateUser(user: IUser, updateData: IUserUpdateInput): Promise<void>;
  
  /**
   * Update the timestamp for the user
   */
  updateTimestamp(user: IUser): Promise<void>;
  
  /**
   * Get the document reference for a user
   */
  getUserRef(user: IUser): DocumentReference;
  
  /**
   * Get user data
   */
  getUserData(user: IUser): DocumentData | undefined;
}
