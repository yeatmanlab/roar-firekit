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
import { User, UserInfo, UserUpdateInput } from './user.model';
import { UserRepository } from './user.repository';
import { UserType } from '../../interfaces';
import { removeUndefined } from '../../firestore/util';

/**
 * Firebase-specific implementation of the user repository
 */
export class FirebaseUserRepository implements UserRepository {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  create(userInfo: UserInfo): User {
    const { 
      roarUid, 
      assessmentUid, 
      assessmentPid, 
      userType = UserType.guest, 
      userMetadata = {},
      testData = false,
      demoData = false,
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
    };
  }

  getRef(user: User): DocumentReference {
    if (user.userType === UserType.guest) {
      return doc(this.db, 'guests', user.assessmentUid);
    } else {
      return doc(this.db, 'users', user.roarUid!);
    }
  }

  get(user: User): Record<string, unknown> | undefined {
    return user.userData as Record<string, unknown>;
  }

  async init(user: User): Promise<void> {
    const userRef = this.getRef(user);
    
    const docSnap = await getDoc(userRef);
    user.onBackend = docSnap.exists();
    
    if (user.onBackend) {
      user.userData = docSnap.data() as Record<string, unknown>;
    } else {
      await this._setUserData(user);
    }
  }

  private async _setUserData(user: User): Promise<void> {
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
    }) as Record<string, unknown>;
    
    const userRef = this.getRef(user);
    await setDoc(userRef, {
      ...user.userData,
      created: serverTimestamp(),
    });
    
    user.onBackend = true;
  }

  async exists(user: User): Promise<void> {
    if (!user.onBackend) {
      await this.init(user);
    }

    if (!user.onBackend) {
      throw new Error('This non-guest user is not in Firestore.');
    }
  }

  async update(user: User, updateInput: UserUpdateInput): Promise<void> {
    await this.exists(user);
    
    const userRef = this.getRef(user);
    
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

  async updateTimestamp(user: User): Promise<void> {
    await this.exists(user);
    
    const userRef = this.getRef(user);
    await updateDoc(userRef, {
      lastUpdated: serverTimestamp(),
    });
  }
}
