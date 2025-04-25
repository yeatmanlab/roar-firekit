import { Firestore } from 'firebase/firestore';
import { User, UserData, UserUpdateInput } from './user.model';
import { UserRepository } from './user.repository';
import { FirebaseUserRepository } from './firebase-user.repository';

/**
 * Service for managing user operations
 */
export class UserService {
  private repository: UserRepository;
  private user: User | null = null;

  /**
   * Create a user service with a specific repository
   */
  constructor(repository: UserRepository) {
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
  async createUser(userData: UserData): Promise<User> {
    this.user = this.repository.create(userData);
    return this.user;
  }

  /**
   * Initialize the user from storage
   */
  async initUser(): Promise<void> {
    if (!this.user) {
      throw new Error('User has not been created. Call createUser first.');
    }
    
    await this.repository.init(this.user);
  }

  /**
   * Check if the user exists in storage
   */
  async checkUserExists(): Promise<void> {
    if (!this.user) {
      throw new Error('User has not been created. Call createUser first.');
    }
    
    await this.repository.exists(this.user);
  }

  /**
   * Update user data
   */
  async updateUser(updateInput: UserUpdateInput): Promise<void> {
    if (!this.user) {
      throw new Error('User has not been created. Call createUser first.');
    }
    
    await this.repository.update(this.user, updateInput);
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
  getUser(): User | null {
    return this.user;
  }
}
