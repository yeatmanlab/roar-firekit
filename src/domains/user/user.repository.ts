import { User, UserInfo, UserUpdateInput } from './user.model';

/**
 * Repository interface for user data access
 */
export interface UserRepository {
  /**
   * Create a user instance
   */
  create(userInfo: UserInfo): User;
  
  /**
   * Initialize user data from storage
   */
  init(user: User): Promise<void>;
  
  /**
   * Check if user exists in storage
   */
  exists(user: User): Promise<void>;
  
  /**
   * Update user data
   */
  update(user: User, updateData: UserUpdateInput): Promise<void>;
  
  /**
   * Update the timestamp for the user
   */
  updateTimestamp(user: User): Promise<void>;
  
  /**
   * Get the reference for a user
   */
  getRef(user: User): unknown;
  
  /**
   * Get user data
   */
  get(user: User): Record<string, unknown> | undefined;
}
