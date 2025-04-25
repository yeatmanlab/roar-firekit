import { Firestore } from 'firebase/firestore';
import { IUser, IUserInfo, IUserUpdateInput } from './user.model';
import { IUserRepository } from './user.repository';
import { FirebaseUserRepository } from './firebase-user.repository';

/**
 * Service for managing user operations
 */
export class UserService {
  private repository: IUserRepository;
  private user: IUser | null = null;

  /**
   * Create a user service with a specific repository
   */
  constructor(repository: IUserRepository) {
    this.repository = repository;
  }

  /**
   * Factory method to create a UserService with a Firebase repository
   */
  static createWithFirebase(db: Firestore): UserService {
    return new UserService(new FirebaseUserRepository(db));
  }

  /**
   * Create and initialize a user
   */
  async createUser(userInfo: IUserInfo): Promise<IUser> {
    this.user = this.repository.createUser(userInfo);
    return this.user;
  }

  /**
   * Initialize the user from storage
   */
  async initUser(): Promise<void> {
    if (!this.user) {
      throw new Error('User has not been created. Call createUser first.');
    }
    
    await this.repository.initUser(this.user);
  }

  /**
   * Check if the user exists in storage
   */
  async checkUserExists(): Promise<void> {
    if (!this.user) {
      throw new Error('User has not been created. Call createUser first.');
    }
    
    await this.repository.checkUserExists(this.user);
  }

  /**
   * Update user data
   */
  async updateUser(updateInput: IUserUpdateInput): Promise<void> {
    if (!this.user) {
      throw new Error('User has not been created. Call createUser first.');
    }
    
    await this.repository.updateUser(this.user, updateInput);
  }

  /**
   * Update the timestamp for the user
   */
  async updateTimestamp(): Promise<void> {
    if (!this.user) {
      throw new Error('User has not been created. Call createUser first.');
    }
    
    await this.repository.updateTimestamp(this.user);
  }

  /**
   * Get the current user
   */
  getUser(): IUser | null {
    return this.user;
  }

  /**
   * Get the user reference
   */
  getUserRef() {
    if (!this.user) {
      throw new Error('User has not been created. Call createUser first.');
    }
    
    return this.repository.getUserRef(this.user);
  }

  /**
   * Get user data
   */
  getUserData() {
    if (!this.user) {
      throw new Error('User has not been created. Call createUser first.');
    }
    
    return this.repository.getUserData(this.user);
  }
}
