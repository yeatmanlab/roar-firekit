import {
  DocumentReference,
  Firestore,
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { User, UserData, UserType, UserUpdateInput } from './user.model';
import { UserRepository } from './user.repository';
import { removeUndefined } from '../../firestore/util';

/**
 * Firebase-specific implementation of the user repository
 */
export class FirebaseUserRepository implements UserRepository {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  create(userData: UserData): User {
    const { 
      roarUid, 
      assessmentUid, 
      assessmentPid, 
      userType = UserType.guest, 
      userMetadata = {},
      testData = false,
      demoData = false,
    } = userData;

    const allowedUserTypes = Object.values(UserType);
    if (!allowedUserTypes.includes(userType)) {
      throw new Error(`User type must be one of ${allowedUserTypes.join(', ')}.`);
    }

    if (roarUid === undefined && userType !== UserType.guest) {
      throw new Error('All non-guest ROAR users must be created with a ROAR UID.');
    }

    if (userType === UserType.guest && roarUid !== undefined) {
      throw new Error('Guest ROAR users cannot have a ROAR UID.');
    }

    if (userType === UserType.guest && !assessmentUid) {
      throw new Error('Guest users must have an assessmentUid.');
    }

    if (userType !== UserType.guest && assessmentPid === undefined) {
      throw new Error('All non-guest ROAR users must have an assessment PID on instantiation.');
    }

    return {
      ...userData,
      userType,
      userMetadata,
      testData,
      demoData,
      onBackend: false,
    };
  }

  /**
   * Firebase-specific method to get document reference
   * This is not part of the UserRepository interface
   */
  private _getDocRef(user: User): DocumentReference {
    if (user.userType === UserType.guest) {
      return doc(this.db, 'guests', user.assessmentUid);
    } else if (user.roarUid) {
      return doc(this.db, 'users', user.roarUid);
    } else {
      throw new Error('Non-guest users must have a roarUid');
    }
  }

  async init(user: User): Promise<void> {
    const userRef = this._getDocRef(user);
    
    const docSnap = await getDoc(userRef);
    user.onBackend = docSnap.exists();
    
    if (user.onBackend) {
      const data = docSnap.data();
      if (data) {
        Object.assign(user, removeUndefined(data));
      }
    } else {
      await this._setUserData(user);
    }
  }

  private async _setUserData(user: User): Promise<void> {
    if (user.userType !== UserType.guest) {
      throw new Error('Cannot set user data on a non-guest ROAR user.');
    }
    
    const userData = removeUndefined({
      ...user.userMetadata,
      assessmentPid: user.assessmentPid,
      assessmentUid: user.assessmentUid,
      userType: user.userType,
      ...(user.testData && { testData: true }),
      ...(user.demoData && { demoData: true }),
    });
    
    const userRef = this._getDocRef(user);
    await setDoc(userRef, {
      ...userData,
      created: serverTimestamp(),
    });
    
    user.onBackend = true;
    user.created = new Date();
  }

  async exists(user: User): Promise<void> {
    if (!user.onBackend) {
      await this.init(user);
    }

    if (!user.onBackend) {
      throw new Error('This non-guest user is not in the backend.');
    }
  }

  async update(user: User, updateInput: UserUpdateInput): Promise<void> {
    await this.exists(user);
    
    const userRef = this._getDocRef(user);
    
    let firestoreData: {
      lastUpdated?: ReturnType<typeof serverTimestamp>;
      tasks?: ReturnType<typeof arrayUnion>;
      variants?: ReturnType<typeof arrayUnion>;
      assessmentPid?: string;
      [key: string]: unknown;
    } = {
      lastUpdated: serverTimestamp(),
    };

    if (updateInput.tasks) {
      firestoreData.tasks = arrayUnion(...updateInput.tasks);
      user.tasks = [...(user.tasks || []), ...updateInput.tasks];
    }
    
    if (updateInput.variants) {
      firestoreData.variants = arrayUnion(...updateInput.variants);
      user.variants = [...(user.variants || []), ...updateInput.variants];
    }

    if (user.userType === UserType.guest) {
      if (updateInput.assessmentPid) {
        firestoreData.assessmentPid = updateInput.assessmentPid;
        user.assessmentPid = updateInput.assessmentPid;
      }
      
      const userMetadata = Object.entries(updateInput)
        .filter(([key]) => !['tasks', 'variants', 'assessmentPid'].includes(key))
        .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
      firestoreData = {
        ...userMetadata,
        ...firestoreData,
      };
      
      Object.assign(user, userMetadata);
    }

    await updateDoc(userRef, removeUndefined(firestoreData));
    user.lastUpdated = new Date();
  }

  async updateTimestamp(user: User): Promise<void> {
    await this.exists(user);
    
    const userRef = this._getDocRef(user);
    await updateDoc(userRef, {
      lastUpdated: serverTimestamp(),
    });
    
    user.lastUpdated = new Date();
  }
}
