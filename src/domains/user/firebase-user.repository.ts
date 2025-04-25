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
import { IUser, IUserInfo, IUserUpdateInput } from './user.model';
import { IUserRepository } from './user.repository';
import { UserType } from '../../interfaces';
import { removeUndefined } from '../../firestore/util';

/**
 * Firebase-specific implementation of the user repository
 */
export class FirebaseUserRepository implements IUserRepository {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  createUser(userInfo: IUserInfo): IUser {
    const { 
      roarUid, 
      assessmentUid, 
      assessmentPid, 
      userType = UserType.guest, 
      userMetadata = {},
      testData = false,
      demoData = false,
      offlineEnabled = false,
      offlineTasks = [],
      offlineAdministrations = [],
    } = userInfo;

    const allowedUserCategories = Object.values(UserType);
    if (!allowedUserCategories.includes(userType)) {
      throw new Error(`User category must be one of ${allowedUserCategories.join(', ')}.`);
    }

    if (roarUid === undefined && userType !== UserType.guest) {
      throw new Error('All non-guest ROAR users must be created with a ROAR UID.');
    }

    if (userType === UserType.guest && roarUid !== undefined) {
      throw new Error('Guest ROAR users cannot have a ROAR UID.');
    }

    if (userType !== UserType.guest && assessmentPid === undefined) {
      throw new Error('All non-guest ROAR users must have an assessment PID on instantiation.');
    }

    return {
      ...userInfo,
      userType,
      userMetadata,
      testData,
      demoData,
      offlineEnabled,
      offlineTasks,
      offlineAdministrations,
    };
  }

  getUserRef(user: IUser): DocumentReference {
    if (user.userType === UserType.guest) {
      return doc(this.db, 'guests', user.assessmentUid);
    } else {
      return doc(this.db, 'users', user.roarUid!);
    }
  }

  getUserData(user: IUser): DocumentData | undefined {
    return user.userData;
  }

  async initUser(user: IUser): Promise<void> {
    const userRef = this.getUserRef(user);
    
    const docSnap = await getDoc(userRef);
    user.onFirestore = docSnap.exists();
    
    if (user.onFirestore) {
      user.userData = docSnap.data();
    } else {
      await this._setUserData(user);
    }
  }

  private async _setUserData(user: IUser): Promise<void> {
    if (user.userType !== UserType.guest) {
      throw new Error('Cannot set user data on a non-guest ROAR user.');
    }
    
    user.userData = removeUndefined({
      ...user.userMetadata,
      assessmentPid: user.assessmentPid,
      assessmentUid: user.assessmentUid,
      userType: user.userType,
      ...(user.testData && { testData: true }),
      ...(user.demoData && { demoData: true }),
    });
    
    const userRef = this.getUserRef(user);
    await setDoc(userRef, {
      ...user.userData,
      created: serverTimestamp(),
    });
    
    user.onFirestore = true;
  }

  async checkUserExists(user: IUser): Promise<void> {
    if (!user.onFirestore) {
      await this.initUser(user);
    }

    if (!user.onFirestore) {
      throw new Error('This non-guest user is not in Firestore.');
    }
  }

  async updateUser(user: IUser, updateInput: IUserUpdateInput): Promise<void> {
    await this.checkUserExists(user);
    
    const userRef = this.getUserRef(user);
    
    let userData: {
      lastUpdated?: ReturnType<typeof serverTimestamp>;
      tasks?: ReturnType<typeof arrayUnion>;
      variants?: ReturnType<typeof arrayUnion>;
      assessmentPid?: string;
      [key: string]: unknown;
    } = {
      lastUpdated: serverTimestamp(),
    };

    if (updateInput.tasks) userData.tasks = arrayUnion(...updateInput.tasks);
    if (updateInput.variants) userData.variants = arrayUnion(...updateInput.variants);

    if (user.userType === UserType.guest) {
      if (updateInput.assessmentPid) userData.assessmentPid = updateInput.assessmentPid;
      
      const { tasks, variants, assessmentPid, ...userMetadata } = updateInput;
      userData = {
        ...userMetadata,
        ...userData,
      };
    }

    user.userData = {
      ...user.userData,
      ...updateInput,
    };

    await updateDoc(userRef, removeUndefined(userData));
  }

  async updateTimestamp(user: IUser): Promise<void> {
    await this.checkUserExists(user);
    
    const userRef = this.getUserRef(user);
    await updateDoc(userRef, {
      lastUpdated: serverTimestamp(),
    });
  }
}
