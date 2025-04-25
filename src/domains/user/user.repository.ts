import { User, UserData, UserUpdateInput } from './user.model';

/**
 * Repository interface for user data access
 */
export interface UserRepository {
  /**
   * Create a user instance
   */
  create(userData: UserData): User;
  
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
}
