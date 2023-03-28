import { FirebaseApp } from 'firebase/app';
import {
  Auth,
  AuthError,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getRedirectResult,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
} from 'firebase/auth';
import {
  DocumentData,
  Firestore,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
} from 'firebase/firestore';
import { FirebaseConfigData, initializeProjectFirekit } from './util';
// import { ITaskVariantInput, RoarTaskVariant } from './task';

interface IRoarConfigData {
  app: FirebaseConfigData;
  admin: FirebaseConfigData;
}

interface IFirekit {
  firebaseApp: FirebaseApp;
  db: Firestore;
  auth: Auth;
  user?: User;
}

enum supplementalDataType {
  admin = 'adminData',
  educator = 'educatorData',
  student = 'studentData',
  caregiver = 'caregiverData',
}

interface IRoarUserData extends DocumentData {
  adminData?: DocumentData;
  educatorData?: DocumentData;
  studentData?: DocumentData;
  caregiverData?: DocumentData;
  // Allow for data from external resources like clever or state-wide tests
  externalData?: {
    [x: string]: unknown;
  };
}

export class RoarFirekit {
  roarConfig: IRoarConfigData;
  app: IFirekit;
  admin: IFirekit;
  userData?: IRoarUserData;
  /**
   * Create a RoarFirekit. This expects an object with keys `roarConfig`,
   * where `roarConfig` is a [[IRoarConfigData]] object.
   * @param {{roarConfig: IRoarConfigData }=} destructuredParam
   *     roarConfig: The ROAR firebase config object
   */
  constructor({ roarConfig }: { roarConfig: IRoarConfigData }) {
    this.roarConfig = roarConfig;

    this.app = initializeProjectFirekit(roarConfig.app, 'app');
    this.admin = initializeProjectFirekit(roarConfig.admin, 'admin');
  }

  //           +------------------------------+
  // ----------| Begin Authentication Methods |----------
  //           +------------------------------+
  async registerWithEmailAndPassword({ email, password }: { email: string; password: string }) {
    return createUserWithEmailAndPassword(this.admin.auth, email, password).then((adminUserCredential) => {
      this.admin.user = adminUserCredential.user;
      return createUserWithEmailAndPassword(this.app.auth, email, password).then((appUserCredential) => {
        this.app.user = appUserCredential.user;
      });
    });
  }

  async logInWithEmailAndPassword({ email, password }: { email: string; password: string }) {
    return signInWithEmailAndPassword(this.admin.auth, email, password).then((adminUserCredential) => {
      this.admin.user = adminUserCredential.user;
      return signInWithEmailAndPassword(this.app.auth, email, password).then((appUserCredential) => {
        this.app.user = appUserCredential.user;
      });
    });
  }

  async signInWithGooglePopup() {
    const provider = new GoogleAuthProvider();
    const allowedErrors = ['auth/cancelled-popup-request', 'auth/popup-closed-by-user'];
    const swallowAllowedErrors = (error: AuthError) => {
      if (!allowedErrors.includes(error.code)) {
        throw error;
      }
    };
    return signInWithPopup(this.app.auth, provider)
      .then((appUserCredential) => {
        // This gives you a Google Access Token. You can use it to access the Google API.
        this.app.user = appUserCredential.user;
        return GoogleAuthProvider.credentialFromResult(appUserCredential);
      })
      .catch(swallowAllowedErrors)
      .then((credential) => {
        if (credential) {
          return signInWithCredential(this.admin.auth, credential)
            .then((adminUserCredential) => {
              // credential = GoogleAuthProvider.credentialFromResult(result);
              this.admin.user = adminUserCredential.user;
            })
            .catch(swallowAllowedErrors);
        }
      });
  }

  async initiateGoogleRedirect() {
    const provider = new GoogleAuthProvider();
    return signInWithRedirect(this.admin.auth, provider);
  }

  async signInFromRedirectResult(enableCookiesCallback: () => void) {
    const catchEnableCookiesError = (error: AuthError) => {
      if (error.code == 'auth/web-storage-unsupported') {
        enableCookiesCallback();
      } else {
        throw error;
      }
    };

    return getRedirectResult(this.admin.auth)
      .then((adminUserCredential) => {
        if (adminUserCredential !== null) {
          this.admin.user = adminUserCredential.user;

          // This gives you a Google Access Token. You can use it to access Google APIs.
          // const credential = GoogleAuthProvider.credentialFromResult(result);
          // const token = credential.accessToken;
          return GoogleAuthProvider.credentialFromResult(adminUserCredential);
        }
      })
      .catch(catchEnableCookiesError)
      .then((credential) => {
        if (credential) {
          return signInWithCredential(this.app.auth, credential).then((appUserCredential) => {
            if (appUserCredential !== null) {
              this.app.user = appUserCredential.user;
            }
          });
        }
      });
  }

  async signOut() {
    return this.app.auth.signOut().then(() => {
      this.app.user = undefined;
      return this.admin.auth.signOut().then(() => {
        this.admin.user = undefined;
      });
    });
  }
  //           +------------------------------+
  // ----------|  End Authentication Methods  |----------
  //           +------------------------------+

  async getUserAdminData() {
    if (this.admin.user === undefined) {
      throw new Error('User is not authenticated.');
    }

    const userDocRef = doc(this.admin.db, 'users', this.admin.user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      this.userData = userDocSnap.data();
      for (const dataType of Object.values(supplementalDataType)) {
        const docRef = doc(userDocRef, dataType);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          this.userData[dataType] = docSnap.data();
        }
      }

      const externalDataSnapshot = await getDocs(collection(userDocRef, 'externalData'));
      let externalData = {};
      externalDataSnapshot.forEach((doc) => {
        // doc.data() is never undefined for query doc snapshots returned by ``getDocs``
        externalData = {
          ...externalData,
          [doc.id]: doc.data(),
        };
      });
      this.userData.externalData = externalData;
    }
  }

  async getAdminRoles() {
    if (this.admin.user === undefined) {
      throw new Error('User is not authenticated.');
    }

    const adminCollection = collection(this.app.db, 'admin');
    const q = query(adminCollection);
    const querySnapshot = await getDocs(q);

    const roles: { [x: string]: boolean } = {};
    querySnapshot.forEach((doc) => {
      roles[doc.id.replace(/s$/, '')] = doc.data().users.includes(this.app.user?.uid);
    });
    return roles;
  }

  async addUserToAdminRequests() {
    const adminCollection = collection(this.app.db, 'admin');
    const requestsRef = doc(adminCollection, 'requests');

    await updateDoc(requestsRef, {
      users: arrayUnion(this.app.user?.uid),
    });
  }

  // createAppFirekit(taskInfo: ITaskVariantInput, rootDoc: string[]);
}
