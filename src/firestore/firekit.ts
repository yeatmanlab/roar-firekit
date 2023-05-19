/* eslint-disable @typescript-eslint/no-non-null-assertion */
import _uniq from 'lodash/uniq';
import _without from 'lodash/without';
import _get from 'lodash/get';
import dot from 'dot-object';
import { StatusCode } from 'status-code-enum';
import {
  AuthError,
  GoogleAuthProvider,
  OAuthProvider,
  ProviderId,
  createUserWithEmailAndPassword,
  getRedirectResult,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { isEmailAvailable, isUsernameAvailable } from '../auth';
import { initializeProjectFirekit, removeNull } from './util';
import {
  IAdministrationData,
  IAssessmentData,
  IExternalUserData,
  IFirekit,
  IAppFirekit,
  IMyAdministrationData,
  IMyAssessmentData,
  IRoarConfigData,
  IUserData,
  UserType,
} from './interfaces';
import { RoarAppUser } from './app/user';

enum OAuthProviderType {
  CLEVER = 'admin',
  GOOGLE = 'educator',
}

const RoarProviderId = {
  ...ProviderId,
  CLEVER: 'oidc.clever',
};

export class RoarFirekit {
  roarConfig: IRoarConfigData;
  app: IAppFirekit;
  admin: IFirekit;
  userData?: IUserData;
  roarAppUser?: RoarAppUser;
  oAuthAccessToken?: string;
  oidcIdToken?: string;
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

    this.app.docRefs = {
      prod: doc(this.app.db, 'prod', 'roar-prod'),
    };
  }

  //           +------------------------------+
  // ----------| Begin Authentication Methods |----------
  //           +------------------------------+

  private _verify_authentication() {
    if (this.admin.user === undefined || this.app.user === undefined) {
      throw new Error('User is not authenticated.');
    }
  }

  private async _associateAppAndAdminUids() {
    this._verify_authentication();
    const syncAccessControl = httpsCallable(this.app.functions, 'syncaccesscontrol');
    const result = await syncAccessControl({ adminUid: this.admin.user!.uid });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (_get(result.data as any, 'status', StatusCode.ServerErrorInternal) === StatusCode.SuccessOK) {
      throw new Error('Failed to associate admin and assessment UIDs.');
    }
  }

  // TODO: Add a private method that calls the syncCleverData cloud function.
  private async _syncCleverData() {
    this._verify_authentication();
    const syncCleverData = httpsCallable(this.app.functions, 'synccleverdata');
    const result = await syncCleverData({ adminUid: this.admin.user!.uid });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (_get(result.data as any, 'status', StatusCode.ServerErrorInternal) === StatusCode.SuccessOK) {
      throw new Error('Failed to sync Clever and ROAR data.');
    }
  }

  async isUsernameAvailable(username: string): Promise<boolean> {
    return isUsernameAvailable(this.admin.auth, username);
  }

  async isEmailAvailable(email: string): Promise<boolean> {
    return isEmailAvailable(this.admin.auth, email);
  }

  async registerWithEmailAndPassword({ email, password }: { email: string; password: string }) {
    return createUserWithEmailAndPassword(this.admin.auth, email, password)
      .catch((error: AuthError) => {
        console.log('Error creating user', error);
        console.log(error.code);
        console.log(error.message);
      })
      .then((adminUserCredential) => {
        this.admin.user = adminUserCredential?.user;
        return createUserWithEmailAndPassword(this.app.auth, email, password)
          .then((appUserCredential) => {
            this.app.user = appUserCredential.user;
          })
          .then(this._associateAppAndAdminUids.bind(this))
          .then(this.getMyData.bind(this));
      });
  }

  async logInWithEmailAndPassword({ email, password }: { email: string; password: string }) {
    return signInWithEmailAndPassword(this.admin.auth, email, password).then((adminUserCredential) => {
      this.admin.user = adminUserCredential.user;
      return signInWithEmailAndPassword(this.app.auth, email, password)
        .then((appUserCredential) => {
          this.app.user = appUserCredential.user;
        })
        .then(this.getMyData.bind(this));
    });
  }

  async signInWithPopup(provider: OAuthProviderType) {
    let authProvider;
    if (provider === OAuthProviderType.GOOGLE) {
      authProvider = new GoogleAuthProvider();
    } else if (provider === OAuthProviderType.CLEVER) {
      authProvider = new OAuthProvider('oidc.clever');
    } else {
      throw new Error(`provider must be one of ${Object.values(OAuthProviderType)}. Received ${provider} instead.`);
    }

    const allowedErrors = ['auth/cancelled-popup-request', 'auth/popup-closed-by-user'];
    const swallowAllowedErrors = (error: AuthError) => {
      if (!allowedErrors.includes(error.code)) {
        throw error;
      }
    };

    return signInWithPopup(this.admin.auth, authProvider)
      .then((adminResult) => {
        this.admin.user = adminResult.user;
        if (provider === OAuthProviderType.GOOGLE) {
          const credential = GoogleAuthProvider.credentialFromResult(adminResult);
          // This gives you a Google Access Token. You can use it to access Google APIs.
          this.oAuthAccessToken = credential?.accessToken;
          return credential;
        } else if (provider === OAuthProviderType.CLEVER) {
          const credential = OAuthProvider.credentialFromResult(adminResult);
          // This gives you a Clever Access Token. You can use it to access Clever APIs.
          this.oAuthAccessToken = credential?.accessToken;
          this.oidcIdToken = credential?.idToken;
          return credential;
        }
      })
      .catch(swallowAllowedErrors)
      .then((credential) => {
        if (credential) {
          return signInWithCredential(this.app.auth, credential)
            .then((appUserCredential) => {
              // credential = GoogleAuthProvider.credentialFromResult(result);
              this.app.user = appUserCredential.user;
            })
            .catch(swallowAllowedErrors);
        }
      })
      .then(this._associateAppAndAdminUids.bind(this))
      .then(this.getMyData.bind(this));
  }

  async initiateRedirect(provider: OAuthProviderType) {
    let authProvider;
    if (provider === OAuthProviderType.GOOGLE) {
      authProvider = new GoogleAuthProvider();
    } else if (provider === OAuthProviderType.CLEVER) {
      authProvider = new OAuthProvider(RoarProviderId.CLEVER);
    } else {
      throw new Error(`provider must be one of ${Object.values(OAuthProviderType)}. Received ${provider} instead.`);
    }

    return signInWithRedirect(this.admin.auth, authProvider);
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
      .then((adminRedirectResult) => {
        if (adminRedirectResult !== null) {
          this.admin.user = adminRedirectResult.user;

          const providerId = adminRedirectResult.providerId;
          if (providerId === RoarProviderId.GOOGLE) {
            const credential = GoogleAuthProvider.credentialFromResult(adminRedirectResult);
            // This gives you a Google Access Token. You can use it to access Google APIs.
            this.oAuthAccessToken = credential?.accessToken;
            return credential;
          } else if (providerId === RoarProviderId.CLEVER) {
            const credential = OAuthProvider.credentialFromResult(adminRedirectResult);
            // This gives you a Clever Access Token. You can use it to access Clever APIs.
            this.oAuthAccessToken = credential?.accessToken;
            this.oidcIdToken = credential?.idToken;
            return credential;
          }
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
      })
      .then(this._associateAppAndAdminUids.bind(this))
      .then(this.getMyData.bind(this));
  }

  async signOut() {
    return this.app.auth.signOut().then(() => {
      this.app.user = undefined;
      return this.admin.auth.signOut().then(() => {
        this.admin.user = undefined;
        this.userData = undefined;
      });
    });
  }

  //           +------------------------------+
  // ----------|  End Authentication Methods  |----------
  //           +------------------------------+

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
        // doc.data() is never undefined for query doc snapshots returned by ``getDocs``
        externalData = {
          ...externalData,
          [doc.id]: doc.data() as IExternalUserData,
        };
      });
      userData.externalData = externalData;

      return userData;
    }
  }

  async getMyData() {
    this._verify_authentication();
    this.userData = await this._getUser(this.admin.user!.uid);
    if (this.userData) {
      this.roarAppUser = new RoarAppUser({
        id: this.admin.user!.uid,
        firebaseUid: this.app.user!.uid,
        birthMonth: this.userData.dob?.getMonth(),
        birthYear: this.userData.dob?.getFullYear(),
        classId: this.userData.studentData?.classId || this.userData!.educatorData?.classId,
        schoolId: this.userData.studentData?.schoolId || this.userData!.educatorData?.schoolId,
        districtId: this.userData.studentData?.districtId || this.userData!.educatorData?.districtId,
        studies: this.userData.studentData?.studies || this.userData!.educatorData?.studies,
        userCategory: this.userData.userType,
      });
    }
  }

  /* Return a list of all UIDs for users that this user has access to */
  async listUsers() {
    this._verify_authentication();
    const accessControlDoc = doc(this.admin.db, 'users', this.admin.user!.uid, 'accessControl', 'users');
    const docSnap = await getDoc(accessControlDoc);
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

  public get roarUid() {
    return this.admin.user?.uid;
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

  // TODO: Create the run in the assessment Firestore, record it and then pass it to the app
  async startAssessment(administrationId: string, taskId: string) {
    this._verify_authentication();

    // Start this run in the assessment Firestore
    // Append runId to `runId` and `allRunIds` for this assessment in the userId/administrations collection

    return this._updateAssessment(administrationId, taskId, { startedOn: new Date() });
  }

  async updateAssessmentRewardShown(administrationId: string, taskId: string) {
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

  async updateUserExternalData(uid: string, externalResourceId: string, externalData: IExternalUserData) {
    const docRef = doc(this.admin.db, 'users', uid, 'externalData', externalResourceId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      // We use the dot-object module to transform the potentially nested external data to
      // dot notation. This prevents overwriting extisting external data.
      // See the note about dot notation in https://firebase.google.com/docs/firestore/manage-data/add-data#update_fields_in_nested_objects
      await updateDoc(
        docRef,
        removeNull(
          dot.dot({
            [externalResourceId]: externalData,
          }),
        ),
      );
    } else {
      await setDoc(docRef, removeNull(externalData));
    }
  }

  async createUser(
    roarUid: string,
    userData: IUserData,
    externalResourceId: string | undefined,
    externalData: { [x: string]: unknown } | undefined,
  ) {
    this._verify_authentication();

    // Add the ID to the admin's list of users
    // This must be done before we create the user (because of the firestore security rules)
    const accessControlDoc = doc(this.admin.db, 'users', this.admin.user!.uid, 'accessControl', 'users');
    await updateDoc(accessControlDoc, {
      [roarUid]: true,
    });

    const userDocRef = doc(this.admin.db, 'users', roarUid);
    await setDoc(userDocRef, userData);

    if (externalResourceId !== undefined && externalData !== undefined) {
      await this.updateUserExternalData(userDocRef.id, externalResourceId, externalData);
    }

    // Add the new user to this admin's list of users in the assessment database ACL.
    const aclDocRef = doc(this.app.db, 'accessControl', this.app.user!.uid);
    await setDoc(
      aclDocRef,
      {
        [roarUid]: true,
      },
      { merge: true },
    );

    // TODO Adam: Add the user to the assessment database as well.
  }

  // async updateUser();

  // TODO: Adam write the appFirekit
  // createAppFirekit(taskInfo: ITaskVariantInput, rootDoc: string[]);
}
