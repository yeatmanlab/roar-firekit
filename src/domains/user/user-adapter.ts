import { DocumentReference, Firestore } from 'firebase/firestore';
import { UserInfo, UserUpdateInput } from '../../firestore/app/user';
import { UserService } from './user.service';
import { User } from './user.model';

/**
 * Adapter class that maintains the existing RoarAppUser interface
 * while using the new service layer architecture internally
 */
export class RoarAppUserAdapter {
  private userService: UserService;
  db: Firestore;
  roarUid?: string;
  assessmentUid: string;
  assessmentPid?: string;
  userData?: any;
  userType: any;
  onFirestore?: boolean;
  userRef: DocumentReference;
  userMetadata: { [key: string]: unknown };
  testData: boolean;
  demoData: boolean;

  constructor(input: UserInfo & { db: Firestore }) {
    this.db = input.db;
    this.roarUid = input.roarUid;
    this.assessmentUid = input.assessmentUid;
    this.assessmentPid = input.assessmentPid;
    this.userType = input.userType;
    this.userMetadata = input.userMetadata || {};
    this.testData = input.testData || false;
    this.demoData = input.demoData || false;

    this.userService = UserService.createWithFirebase(this.db);
    
    this.userService.createUser({
      roarUid: this.roarUid,
      assessmentUid: this.assessmentUid,
      assessmentPid: this.assessmentPid,
      userType: this.userType,
      userMetadata: this.userMetadata,
      testData: this.testData,
      demoData: this.demoData,
    });
    
    this.userRef = this.userService.getUserRef() as DocumentReference;
  }

  async init() {
    await this.userService.initUser();
    
    const user = this.userService.getUser() as User;
    this.onFirestore = user.onBackend;
    this.userData = user.userData;
    
    return;
  }

  async checkUserExists() {
    await this.userService.checkUserExists();
    
    const user = this.userService.getUser() as User;
    this.onFirestore = user.onBackend;
  }

  async updateUser(updateInput: UserUpdateInput): Promise<void> {
    await this.userService.updateUser(updateInput);
    
    const user = this.userService.getUser() as User;
    this.userData = user.userData;
  }

  async updateFirestoreTimestamp() {
    await this.userService.updateTimestamp();
  }
}
