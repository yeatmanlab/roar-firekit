/* eslint-disable @typescript-eslint/no-non-null-assertion */
import _uniq from 'lodash/uniq';
import _without from 'lodash/without';
import {
  AuthError,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
} from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
} from 'firebase/firestore';
import { initializeProjectFirekit } from './util';
import {
  IAdministrationData,
  IAssessmentData,
  IFirekit,
  IMyAdministrationData,
  IMyAssessmentData,
  IRoarConfigData,
  IUserData,
  UserType,
} from './interfaces';
// import { ITaskVariantInput, RoarTaskVariant } from './task';

export class RoarFirekit {
  roarConfig: IRoarConfigData;
  app: IFirekit;
  admin: IFirekit;
  userData?: IUserData;
  /**
   * Create a RoarFirekit. This expects an object with keys `roarConfig`,
   * where `roarConfig` is a [[IRoarConfigData]] object.
   * @param {{roarConfig: IRoarConfigData }=} destructuredParam
   *     roarConfig: The ROAR firebase config object
   */
  constructor({ roarConfig, enableDbPersistence }: { roarConfig: IRoarConfigData; enableDbPersistence: boolean }) {
    this.roarConfig = roarConfig;

    this.app = initializeProjectFirekit(roarConfig.app, 'app', enableDbPersistence);
    this.admin = initializeProjectFirekit(roarConfig.admin, 'admin', enableDbPersistence);
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

  private _verify_authentication() {
    if (this.admin.user === undefined) {
      throw new Error('User is not authenticated.');
    }
  }

  private async _getUser(uid: string): Promise<IUserData | undefined> {
    this._verify_authentication();
    const userDocRef = doc(this.admin.db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      let userData = {} as IUserData;
      if (userDocSnap.data().userType) {
        userData = userDocSnap.data() as IUserData;
      } else {
        userData = {
          userType: UserType.guest,
          ...userDocSnap.data(),
        };
      }

      const externalDataSnapshot = await getDocs(collection(userDocRef, 'externalData'));
      let externalData = {};
      externalDataSnapshot.forEach((doc) => {
        // TODO: Elijah add externalData to the dummy data created by Python
        // doc.data() is never undefined for query doc snapshots returned by ``getDocs``
        externalData = {
          ...externalData,
          [doc.id]: doc.data(),
        };
      });
      userData.externalData = externalData;

      return userData;
    }
  }

  async getMyData() {
    this._verify_authentication();
    this.userData = await this._getUser(this.admin.user!.uid);
  }

  async getMyAdminRoles() {
    this._verify_authentication();
    const adminCollection = collection(this.app.db, 'admin');
    const q = query(adminCollection);
    const querySnapshot = await getDocs(q);

    const roles: { [x: string]: boolean } = {};
    querySnapshot.forEach((doc) => {
      roles[doc.id.replace(/s$/, '')] = doc.data().users.includes(this.app.user?.uid);
    });
    return roles;
  }

  async addMeToAdminRequests() {
    const adminCollection = collection(this.app.db, 'admin');
    const requestsRef = doc(adminCollection, 'requests');

    await updateDoc(requestsRef, {
      users: arrayUnion(this.app.user?.uid),
    });
  }

  // TODO: Adam write the appFirekit
  // createAppFirekit(taskInfo: ITaskVariantInput, rootDoc: string[]);

  /* Return a list of all UIDs for users that this user has access to */
  async listUsers() {
    this._verify_authentication();
    const adminUsersDoc = doc(this.admin.db, 'users', this.admin.user!.uid, 'adminData', 'users');
    const docSnap = await getDoc(adminUsersDoc);
    if (docSnap.exists()) {
      return Object.keys(docSnap.data());
    }
    return null;
  }

  /* Return a list of Promises for user objects for each of the UIDs given in the input array */
  getUsers(uidArray: string[]): Promise<IUserData | undefined>[] {
    this._verify_authentication();
    return uidArray.map((uid) => this._getUser(uid));
  }

  public get administrationsAssigned() {
    return this.userData?.administrationsAssigned;
  }

  public get administrationsStarted() {
    return this.userData?.administrationsStarted;
  }

  public get administrationsCompleted() {
    return this.userData?.administrationsCompleted;
  }

  private async _getGlobalAdministration(administrationId: string): Promise<IAdministrationData | undefined> {
    this._verify_authentication();
    const docRef = doc(this.admin.db, 'administrations', administrationId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as IAdministrationData;
    }
  }

  getAdministrations(administrationIds: string[]): Promise<IAdministrationData | undefined>[] {
    this._verify_authentication();
    return administrationIds.map((id) => this._getGlobalAdministration(id));
  }

  private async _getMyAdministration(administrationId: string): Promise<IMyAdministrationData | undefined> {
    this._verify_authentication();
    const docRef = doc(this.admin.db, 'users', this.admin.user!.uid, 'administrations', administrationId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as IMyAdministrationData;
    }
  }

  getMyAdministrations(administrationIds: string[]): Promise<IMyAdministrationData | undefined>[] {
    this._verify_authentication();
    return administrationIds.map((id) => this._getMyAdministration(id));
  }

  async completeAdministration(administrationId: string) {
    this._verify_authentication();
    const docRef = doc(this.admin.db, 'users', this.admin.user!.uid, 'administrations', administrationId);
    return updateDoc(docRef, { completed: true });
  }

  private async _updateAssessment(administrationId: string, taskId: string, updates: { [x: string]: unknown }) {
    this._verify_authentication();
    const docRef = doc(this.admin.db, 'users', this.admin.user!.uid, 'administrations', administrationId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const assessmentInfo = docSnap.data().assessments.find((a: IMyAssessmentData) => a.taskId === taskId);
      // First remove the old assessment to avoid duplication
      await updateDoc(docRef, {
        assessments: arrayRemove(assessmentInfo),
      });
      const newAssessmentInfo = {
        ...assessmentInfo,
        ...updates,
      };
      await updateDoc(docRef, {
        assessments: arrayUnion(newAssessmentInfo),
      });
    }
  }

  async startAssessment(administrationId: string, taskId: string) {
    this._verify_authentication();
    return this._updateAssessment(administrationId, taskId, { startedOn: new Date() });
  }

  async showAssessmentReward(administrationId: string, taskId: string) {
    this._verify_authentication();
    return this._updateAssessment(administrationId, taskId, { rewardShown: true });
  }

  async completeAssessment(administrationId: string, taskId: string) {
    await this._updateAssessment(administrationId, taskId, { completedOn: new Date() });

    // Check to see if all of the assessments have been completed,
    // If so, complete the administration
    const docRef = doc(this.admin.db, 'users', this.admin.user!.uid, 'administrations', administrationId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      if (docSnap.data().assessments.every((a: IMyAssessmentData) => a.completedOn !== null)) {
        this.completeAdministration(administrationId);
      }
    }
  }

  // These are all methods that will be important for admins, but not necessary for students
  async createAdministration(assessments: IAssessmentData[], dateOpen: Date, dateClosed: Date, sequential = true) {
    this._verify_authentication();

    // First add the administration to the database
    const administrationData: IAdministrationData = {
      createdBy: this.admin.user!.uid,
      assignedUsers: [],
      assignedClasses: [],
      assignedSchools: [],
      assignedDistricts: [],
      assignedGrades: [],
      dateCreated: new Date(),
      dateOpened: dateOpen,
      dateClosed: dateClosed,
      assessments: assessments,
      sequential: sequential,
    };
    const administrationDocRef = await addDoc(collection(this.admin.db, 'administrations'), administrationData);

    // Then add the ID to the admin's list of administrationsCreated
    const userDocRef = doc(this.admin.db, 'users', this.admin.user!.uid);
    await updateDoc(userDocRef, {
      'adminData.administrationsCreated': arrayUnion(administrationDocRef.id),
    });
  }

  async assignAdministrationToUsers(administrationId: string, userIds: string[]) {
    this._verify_authentication();
    const users = await Promise.all(this.getUsers(userIds));
    const studentData = _without(
      users.map((user: IUserData | undefined) => user?.studentData),
      undefined,
    );
    const assignedClasses = _uniq(studentData.map((user) => user!.classId));
    const assignedSchools = _uniq(studentData.map((user) => user!.schoolId));
    const assignedDistricts = _uniq(studentData.map((user) => user!.districtId));
    const assignedGrades = _uniq(studentData.map((user) => user!.grade));

    const docRef = doc(this.admin.db, 'administrations', administrationId);
    await updateDoc(docRef, {
      assignedUsers: arrayUnion(userIds),
      assignedClasses: arrayUnion(assignedClasses),
      assignedSchools: arrayUnion(assignedSchools),
      assignedDistricts: arrayUnion(assignedDistricts),
      assignedGrades: arrayUnion(assignedGrades),
    });
  }

  async unassignAdministrationToUsers(administrationId: string, userIds: string[]) {
    this._verify_authentication();

    const administrationInfo = await Promise.all(this.getAdministrations([administrationId]));
    const currentlyAssignedUserIds = administrationInfo[0]?.assignedUsers;

    // Remaining users that will survive this deletion
    const remainingUserIds = _without(currentlyAssignedUserIds, ...userIds);
    const remainingUsers = await Promise.all(this.getUsers(remainingUserIds));
    const remainingUserData = _without(
      remainingUsers.map((user: IUserData | undefined) => user?.studentData),
      undefined,
    );

    // The users that will be deleted
    const usersToRemove = await Promise.all(this.getUsers(userIds));
    const userDataToRemove = _without(
      usersToRemove.map((user: IUserData | undefined) => user?.studentData),
      undefined,
    );

    // These are the org Ids that we need to keep even after removing the users
    const classesToKeep = _uniq(remainingUserData.map((user) => user!.classId));
    const schoolsToKeep = _uniq(remainingUserData.map((user) => user!.schoolId));
    const districtsToKeep = _uniq(remainingUserData.map((user) => user!.districtId));
    const gradesToKeep = _uniq(remainingUserData.map((user) => user!.grade));

    // Initially, these are the org Ids for all of the users to be deleted
    let classesToRemove = _uniq(userDataToRemove.map((user) => user!.classId));
    let schoolsToRemove = _uniq(userDataToRemove.map((user) => user!.schoolId));
    let districtsToRemove = _uniq(userDataToRemove.map((user) => user!.districtId));
    let gradesToRemove = _uniq(userDataToRemove.map((user) => user!.grade));

    // Now we remove the ones that we want to keep (from the remaining users)
    // from the ones that we want to get rid of
    classesToRemove = _without(classesToRemove, ...classesToKeep);
    schoolsToRemove = _without(schoolsToRemove, ...schoolsToKeep);
    districtsToRemove = _without(districtsToRemove, ...districtsToKeep);
    gradesToRemove = _without(gradesToRemove, ...gradesToKeep);

    const docRef = doc(this.admin.db, 'administrations', administrationId);
    await updateDoc(docRef, {
      assignedUsers: arrayRemove(userIds),
      assignedClasses: arrayRemove(classesToRemove),
      assignedSchools: arrayRemove(schoolsToRemove),
      assignedDistricts: arrayRemove(districtsToRemove),
      assignedGrades: arrayRemove(gradesToRemove),
    });
  }

  // async createUser();
  // async updateUser();
}
