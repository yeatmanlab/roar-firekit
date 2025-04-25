import { Firestore } from 'firebase/firestore';
import { UserInfo as AppUserInfo, UserUpdateInput as AppUserUpdateInput } from '../../firestore/app/user';
import { UserService } from './user.service';
import { User, UserData, UserType } from './user.model';

/**
 * Adapter class that maintains the existing RoarAppUser interface
 * while using the new service layer architecture internally
 */
export class RoarAppUserAdapter {
  private userService: UserService;
  private _internalUser: User | null = null;
  
  db: Firestore;
  roarUid?: string;
  assessmentUid: string;
  assessmentPid?: string;
  userType: UserType;
  onFirestore?: boolean;
  userRef: Record<string, unknown>;
  userMetadata: { [key: string]: unknown };
  testData: boolean;
  demoData: boolean;
  tasks?: string[];
  variants?: string[];

  constructor(input: AppUserInfo & { db: Firestore }) {
    this.db = input.db;
    this.roarUid = input.roarUid;
    this.assessmentUid = input.assessmentUid;
    this.assessmentPid = input.assessmentPid;
    this.userType = input.userType as UserType;
    this.userMetadata = input.userMetadata || {};
    this.testData = input.testData || false;
    this.demoData = input.demoData || false;

    this.userService = UserService.createWithFirebase(this.db);
    
    const userData: UserData = {
      roarUid: this.roarUid,
      assessmentUid: this.assessmentUid,
      assessmentPid: this.assessmentPid,
      userType: this.userType,
      userMetadata: this.userMetadata,
      testData: this.testData,
      demoData: this.demoData,
    };
    
    this.userService.createUser(userData).then(user => {
      this._internalUser = user;
    });
    
    this.userRef = {}; // Placeholder
  }

  async init() {
    await this.userService.initUser();
    
    const user = this.userService.getUser() as User;
    this.onFirestore = user.onBackend;
    this._syncFromUser(user);
    
    return;
  }

  async checkUserExists() {
    await this.userService.checkUserExists();
    
    const user = this.userService.getUser() as User;
    this.onFirestore = user.onBackend;
    this._syncFromUser(user);
  }

  async updateUser(updateInput: AppUserUpdateInput): Promise<void> {
    await this.userService.updateUser(updateInput);
    
    const user = this.userService.getUser() as User;
    this._syncFromUser(user);
  }

  async updateFirestoreTimestamp() {
    await this.userService.updateTimestamp();
  }
  
  /**
   * Sync properties from the internal User model to this adapter
   */
  private _syncFromUser(user: User) {
    this.roarUid = user.roarUid;
    this.assessmentUid = user.assessmentUid;
    this.assessmentPid = user.assessmentPid;
    this.userType = user.userType || UserType.guest;
    this.userMetadata = user.userMetadata || {};
    this.testData = user.testData || false;
    this.demoData = user.demoData || false;
    this.tasks = user.tasks;
    this.variants = user.variants;
  }
}
