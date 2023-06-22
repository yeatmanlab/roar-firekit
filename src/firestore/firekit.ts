/* eslint-disable @typescript-eslint/no-non-null-assertion */
import _filter from 'lodash/filter';
import _fromPairs from 'lodash/fromPairs';
import _get from 'lodash/get';
import _set from 'lodash/set';
import _isEmpty from 'lodash/isEmpty';
import _keys from 'lodash/keys';
import _map from 'lodash/map';
import _nth from 'lodash/nth';
import _union from 'lodash/union';
import dot from 'dot-object';
import {
  AuthError,
  GoogleAuthProvider,
  OAuthProvider,
  ProviderId,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { isEmailAvailable, isUsernameAvailable, roarEmail } from '../auth';
import { AuthPersistence, MarkRawConfig, emptyOrg, emptyOrgList, initializeProjectFirekit, removeNull } from './util';
import {
  IAdministrationData,
  IAssessmentData,
  IExternalUserData,
  IFirekit,
  IAssignmentData,
  IAssignedAssessmentData,
  IRoarConfigData,
  IUserData,
  UserType,
  IOrgLists,
  IStudentData,
} from './interfaces';
import { IUserInput } from './app/user';
import { RoarAppkit } from './app/appkit';
import { getTaskAndVariant } from './query-assessment';

enum AuthProviderType {
  CLEVER = 'clever',
  CLASSLINK = 'classlink',
  GOOGLE = 'google',
  EMAIL = 'email',
  USERNAME = 'username',
}

const RoarProviderId = {
  ...ProviderId,
  CLEVER: 'oidc.clever',
};

interface ICreateUserInput {
  age_month: string | null;
  age_year: string | null;
  dob: string | null;
  grade: string;
  ell_status?: boolean;
  iep_status?: boolean;
  frl_status?: boolean;
  gender?: string;
  name?: {
    first?: string;
    middle?: string;
    last?: string;
  };
  school: string | null;
  district: string | null;
  class: string | null;
  family: string | null;
  study: string | null;
}

interface ICurrentAssignments {
  assigned: string[];
  started: string[];
  completed: string[];
}

export class RoarFirekit {
  admin?: IFirekit;
  app?: IFirekit;
  currentAssignments?: ICurrentAssignments;
  oAuthAccessToken?: string;
  roarAppUserInfo?: IUserInput;
  roarConfig: IRoarConfigData;
  userData?: IUserData;
  private _adminOrgs?: Record<string, string[]>;
  private _authPersistence: AuthPersistence;
  private _initialized: boolean;
  private _markRawConfig: MarkRawConfig;
  private _superAdmin?: boolean;
  /**
   * Create a RoarFirekit. This expects an object with keys `roarConfig`,
   * where `roarConfig` is a [[IRoarConfigData]] object.
   * @param {{roarConfig: IRoarConfigData }=} destructuredParam
   *     roarConfig: The ROAR firebase config object
   */
  constructor({
    roarConfig,
    authPersistence = AuthPersistence.session,
    markRawConfig = {},
  }: {
    roarConfig: IRoarConfigData;
    dbPersistence: boolean;
    authPersistence?: AuthPersistence;
    markRawConfig?: MarkRawConfig;
  }) {
    this.roarConfig = roarConfig;
    this._authPersistence = authPersistence;
    this._markRawConfig = markRawConfig;
    this._initialized = false;
  }

  private _scrubAuthProperties() {
    this.userData = undefined;
    this.roarAppUserInfo = undefined;
    this._adminOrgs = undefined;
    this.currentAssignments = undefined;
    this.oAuthAccessToken = undefined;
  }

  async init() {
    this.app = await initializeProjectFirekit(this.roarConfig.app, 'app', this._authPersistence, this._markRawConfig);

    this.admin = await initializeProjectFirekit(
      this.roarConfig.admin,
      'admin',
      this._authPersistence,
      this._markRawConfig,
    );

    this._initialized = true;

    onAuthStateChanged(this.admin.auth, (user) => {
      if (this.admin) {
        if (user) {
          this.admin.user = user;
          this._listenToClaims(this.admin);
          if (this.app?.user) {
            this.getMyData();
          }
        } else {
          this.admin.user = undefined;
          this._scrubAuthProperties();
        }
      }
    });

    onAuthStateChanged(this.app.auth, (user) => {
      if (this.app) {
        if (user) {
          this.app.user = user;
          this._listenToClaims(this.app);
          if (this.admin?.user) {
            this.getMyData();
          }
        } else {
          this.app.user = undefined;
          this._scrubAuthProperties();
        }
      }
    });

    this._listenToTokenChange(this.admin);

    return this;
  }

  //           +--------------------------------+
  // ----------|  Begin Authentication Methods  |----------
  //           +--------------------------------+

  public get initialized() {
    return this._initialized;
  }

  private _verifyInit() {
    if (!this._initialized) {
      throw new Error('RoarFirekit has not been initialized. Use the `init` method.');
    }
  }

  private _isAuthenticated() {
    this._verifyInit();
    return !(this.admin!.user === undefined || this.app!.user === undefined);
  }

  private _verifyAuthentication() {
    this._verifyInit();
    if (!this._isAuthenticated()) {
      throw new Error('User is not authenticated.');
    }
  }

  private _verify_admin() {
    if (!this._superAdmin) {
      const errorMessage = 'User is not an administrator.';
      const error = new Error(errorMessage);
      if (this._adminOrgs === undefined) {
        throw error;
      } else if (_isEmpty(_union(...Object.values(this._adminOrgs)))) {
        throw error;
      }
    }
  }

  private _listenToClaims = (firekit: IFirekit) => {
    this._verifyInit();
    if (firekit.user) {
      onSnapshot(doc(firekit.db, 'userClaims', firekit.user!.uid), (doc) => {
        const data = doc.data();
        if (data!.lastUpdated) {
          const lastUpdated = new Date(data!.lastUpdated);
          if (!firekit.claimsLastUpdated || lastUpdated > firekit.claimsLastUpdated) {
            // Update the user's ID token and refresh claimsLastUpdated.
            firekit.user!.getIdToken(true);
            firekit.claimsLastUpdated = lastUpdated;
          }
        }
      });
    }
  };

  private _listenToTokenChange = (firekit: IFirekit) => {
    this._verifyInit();
    onIdTokenChanged(firekit.auth, async (user) => {
      if (user) {
        const idTokenResult = await user.getIdTokenResult(false);
        this._adminOrgs = idTokenResult.claims.adminOrgs;
        this._superAdmin = Boolean(idTokenResult.claims.super_admin);
      }
    });
  };

  private async _setUidCustomClaims() {
    this._verifyAuthentication();

    const setAdminUidClaims = httpsCallable(this.admin!.functions, 'setuidclaims');
    const adminResult = await setAdminUidClaims({ assessmentUid: this.app!.user!.uid });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (_get(adminResult.data as any, 'status') !== 'ok') {
      throw new Error('Failed to associate admin and assessment UIDs in the admin Firebase project.');
    }

    const setAppUidClaims = httpsCallable(this.app!.functions, 'setuidclaims');
    const appResult = await setAppUidClaims({ adminUid: this.admin!.user!.uid, roarUid: this.roarUid! });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (_get(appResult.data as any, 'status') !== 'ok') {
      throw new Error('Failed to associate admin and assessment UIDs in the app Firebase project.');
    }
  }

  private async _syncCleverData(oAuthAccessToken?: string, authProvider?: AuthProviderType) {
    if (authProvider === AuthProviderType.CLEVER) {
      if (oAuthAccessToken === undefined) {
        throw new Error('No OAuth access token provided.');
      }
      this._verifyAuthentication();
      const syncAdminCleverData = httpsCallable(this.admin!.functions, 'synccleverdata');
      const adminResult = await syncAdminCleverData({
        assessmentUid: this.app!.user!.uid,
        accessToken: oAuthAccessToken,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (_get(adminResult.data as any, 'status') !== 'ok') {
        throw new Error('Failed to sync Clever and ROAR data.');
      }

      const syncAppCleverData = httpsCallable(this.app!.functions, 'synccleverdata');
      const appResult = await syncAppCleverData({
        adminUid: this.admin!.user!.uid,
        roarUid: this.roarUid,
        accessToken: oAuthAccessToken,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (_get(appResult.data as any, 'status') !== 'ok') {
        throw new Error('Failed to sync Clever and ROAR data.');
      }
    }
  }

  async isUsernameAvailable(username: string): Promise<boolean> {
    this._verifyInit();
    return isUsernameAvailable(this.admin!.auth, username);
  }

  async isEmailAvailable(email: string): Promise<boolean> {
    this._verifyInit();
    return isEmailAvailable(this.admin!.auth, email);
  }

  async registerWithEmailAndPassword({ email, password }: { email: string; password: string }) {
    this._verifyInit();
    return createUserWithEmailAndPassword(this.admin!.auth, email, password)
      .catch((error: AuthError) => {
        console.log('Error creating user', error);
        console.log(error.code);
        console.log(error.message);
      })
      .then(() => {
        return createUserWithEmailAndPassword(this.app!.auth, email, password).then(
          this._setUidCustomClaims.bind(this),
        );
      });
  }

  async logInWithEmailAndPassword({ email, password }: { email: string; password: string }) {
    this._verifyInit();
    return signInWithEmailAndPassword(this.admin!.auth, email, password).then(() => {
      return signInWithEmailAndPassword(this.app!.auth, email, password).then(this._setUidCustomClaims.bind(this));
    });
  }

  async logInWithUsernameAndPassword({ username, password }: { username: string; password: string }) {
    const email = roarEmail(username);
    return this.logInWithEmailAndPassword({ email, password });
  }

  async signInWithPopup(provider: AuthProviderType) {
    this._verifyInit();
    const allowedProviders = [AuthProviderType.GOOGLE, AuthProviderType.CLEVER];

    let authProvider;
    if (provider === AuthProviderType.GOOGLE) {
      authProvider = new GoogleAuthProvider();
    } else if (provider === AuthProviderType.CLEVER) {
      authProvider = new OAuthProvider(RoarProviderId.CLEVER);
    } else {
      throw new Error(`provider must be one of ${allowedProviders.join(', ')}. Received ${provider} instead.`);
    }

    const allowedErrors = ['auth/cancelled-popup-request', 'auth/popup-closed-by-user'];
    const swallowAllowedErrors = (error: AuthError) => {
      if (!allowedErrors.includes(error.code)) {
        throw error;
      }
    };

    let oAuthAccessToken: string | undefined;

    return signInWithPopup(this.admin!.auth, authProvider)
      .then((adminResult) => {
        if (provider === AuthProviderType.GOOGLE) {
          const credential = GoogleAuthProvider.credentialFromResult(adminResult);
          // This gives you a Google Access Token. You can use it to access Google APIs.
          // TODO: Find a way to put this in the onAuthStateChanged handler
          oAuthAccessToken = credential?.accessToken;
          return credential;
        } else if (provider === AuthProviderType.CLEVER) {
          const credential = OAuthProvider.credentialFromResult(adminResult);
          // This gives you a Clever Access Token. You can use it to access Clever APIs.
          // TODO: Find a way to put this in the onAuthStateChanged handler
          oAuthAccessToken = credential?.accessToken;
          return credential;
        }
      })
      .catch(swallowAllowedErrors)
      .then((credential) => {
        if (credential) {
          return signInWithCredential(this.app!.auth, credential).catch(swallowAllowedErrors);
        }
      })
      .then(this._setUidCustomClaims.bind(this))
      .then(this._syncCleverData.bind(this, oAuthAccessToken, provider));
  }

  async initiateRedirect(provider: AuthProviderType) {
    this._verifyInit();
    const allowedProviders = [AuthProviderType.GOOGLE, AuthProviderType.CLEVER];

    let authProvider;
    if (provider === AuthProviderType.GOOGLE) {
      authProvider = new GoogleAuthProvider();
    } else if (provider === AuthProviderType.CLEVER) {
      authProvider = new OAuthProvider(RoarProviderId.CLEVER);
    } else {
      throw new Error(`provider must be one of ${allowedProviders.join(', ')}. Received ${provider} instead.`);
    }

    return signInWithRedirect(this.admin!.auth, authProvider);
  }

  async signInFromRedirectResult(enableCookiesCallback: () => void) {
    this._verifyInit();
    const catchEnableCookiesError = (error: AuthError) => {
      if (error.code == 'auth/web-storage-unsupported') {
        enableCookiesCallback();
      } else {
        throw error;
      }
    };

    let oAuthAccessToken: string | undefined;
    let authProvider: AuthProviderType | undefined;

    return getRedirectResult(this.admin!.auth)
      .then((adminRedirectResult) => {
        if (adminRedirectResult !== null) {
          const providerId = adminRedirectResult.providerId;
          if (providerId === RoarProviderId.GOOGLE) {
            const credential = GoogleAuthProvider.credentialFromResult(adminRedirectResult);
            // This gives you a Google Access Token. You can use it to access Google APIs.
            // TODO: Find a way to put this in the onAuthStateChanged handler
            authProvider = AuthProviderType.GOOGLE;
            oAuthAccessToken = credential?.accessToken;
            return credential;
          } else if (providerId === RoarProviderId.CLEVER) {
            const credential = OAuthProvider.credentialFromResult(adminRedirectResult);
            // This gives you a Clever Access Token. You can use it to access Clever APIs.
            // TODO: Find a way to put this in the onAuthStateChanged handler
            authProvider = AuthProviderType.CLEVER;
            oAuthAccessToken = credential?.accessToken;
            return credential;
          }
        }
      })
      .catch(catchEnableCookiesError)
      .then((credential) => {
        if (credential) {
          return signInWithCredential(this.app!.auth, credential);
        }
      })
      .then(this._setUidCustomClaims.bind(this))
      .then(this._syncCleverData.bind(this, oAuthAccessToken, authProvider));
  }

  private async _signOutApp() {
    await signOut(this.app!.auth);
  }

  private async _signOutAdmin() {
    await signOut(this.admin!.auth);
  }

  async signOut() {
    this._verifyAuthentication();
    await this._signOutApp();
    await this._signOutAdmin();
  }

  //           +--------------------------------+
  // ----------|   End Authentication Methods   |----------
  //           +--------------------------------+

  //           +--------------------------------+
  // ----------| Begin Methods to Read User and |----------
  // ----------| Assignment/Administration Data |----------
  //           +--------------------------------+

  public get superAdmin() {
    return this._superAdmin;
  }

  public get adminOrgs() {
    return this._adminOrgs;
  }

  public get dbRefs() {
    if (this.admin?.user && this.app?.user) {
      return {
        admin: {
          user: doc(this.admin.db, 'users', this.roarUid!),
          assignments: collection(this.admin.db, 'users', this.roarUid!, 'assignments'),
        },
        app: {
          user: doc(this.app.db, 'users', this.roarUid!),
          runs: collection(this.app.db, 'users', this.roarUid!, 'runs'),
        },
      };
    } else {
      return undefined;
    }
  }

  private async _getUser(uid: string): Promise<IUserData | undefined> {
    this._verifyAuthentication();
    const userDocRef = doc(this.admin!.db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const userData = {
        userType: UserType.guest,
        ...userDocSnap.data(),
      } as IUserData;

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
    } else {
      return {
        userType: UserType.guest,
        districts: emptyOrg(),
        schools: emptyOrg(),
        classes: emptyOrg(),
        families: emptyOrg(),
        studies: emptyOrg(),
        archived: false,
      };
    }
  }

  async getMyData() {
    this._verifyAuthentication();
    this.userData = await this._getUser(this.roarUid!);

    if (this.userData) {
      // Get current assignments by first getting all assignments and then filtering by dates
      this.currentAssignments = {
        assigned: _keys(this.userData?.assignmentsAssigned),
        started: _keys(this.userData?.assignmentsStarted),
        completed: _keys(this.userData?.assignmentCompleted),
      };

      // Create a list of all assignments
      const allAssignments = _union(...Object.values(this.currentAssignments)) as string[];
      // Map that list into an object with the assignment IDs as the keys and the
      // assignment data as the values
      const assignmentInfo = _fromPairs(
        await Promise.all(_map(allAssignments, async (assignment) => [assignment, this._getAssignment(assignment)])),
      );

      // Loop through the assignments and filter out non-current ones
      const now = new Date();
      for (const assignmentStatus in this.currentAssignments) {
        const key = assignmentStatus as keyof ICurrentAssignments;
        this.currentAssignments[key] = _filter(this.currentAssignments[key], (assignmentId) => {
          const { dateOpened, dateClosed } = assignmentInfo[assignmentId];
          return dateOpened < now && dateClosed > now;
        });
      }

      // Create a RoarAppUserInfo for later ingestion into a RoarAppkit
      // First determine the PID. If the user has signed in through Clever, then
      // the PID has been set to the Clever ID in the firebase cloud function.
      // If the user signed in through another method, the PID **may** have been
      // set to something else. Grab it if it's there.
      // In either case, it will then be present in this.userData.
      let assessmentPid: string | undefined = _get(this.userData, 'assessmentPid');

      // If the assessmentPid is undefined, set it to the local part of the user's email.
      if (!assessmentPid) {
        assessmentPid = _nth(this.app!.user!.email?.match(/^(.+)@/), 1);
      }

      this.roarAppUserInfo = {
        db: this.app!.db,
        roarUid: this.roarUid,
        assessmentUid: this.app!.user!.uid,
        assessmentPid: assessmentPid,
        userType: this.userData.userType,
      };
    }
  }

  /* Return a list of all UIDs for users that this user has access to */
  async listUsers() {
    this._verifyAuthentication();

    throw new Error('Method not currently implemented.');

    // const userCollectionRef = collection(this.admin.db, 'users');
    // const userQuery = query(
    //   userCollectionRef,
    //   or(
    //     where('districts', 'array-contains', this.roarUid!),
    //     where('schools', 'array-contains', this.roarUid!),
    //     where('classes', 'array-contains', this.roarUid!),
    //     where('studies', 'array-contains', this.roarUid!),
    //     where('families', 'array-contains', this.roarUid!),
    //   ),
    // );
    // // TODO: Query all users within this user's admin orgs
    // // TODO: Append the current user's uid to the list of UIDs
    // return null;
  }

  /* Return a list of Promises for user objects for each of the UIDs given in the input array */
  getUsers(uidArray: string[]): Promise<IUserData | undefined>[] {
    this._verifyAuthentication();
    return uidArray.map((uid) => this._getUser(uid));
  }

  public get roarUid() {
    return this.admin?.user?.uid;
  }

  private async _getAdministration(administrationId: string): Promise<IAdministrationData | undefined> {
    this._verifyAuthentication();
    const docRef = doc(this.admin!.db, 'administrations', administrationId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as IAdministrationData;
    }
  }

  getAdministrations(administrationIds: string[]): Promise<IAdministrationData | undefined>[] {
    this._verifyAuthentication();
    return administrationIds.map((id) => this._getAdministration(id));
  }

  private async _getAssignment(administrationId: string): Promise<IAssignmentData | undefined> {
    this._verifyAuthentication();
    const docRef = doc(this.dbRefs!.admin.assignments, administrationId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as IAssignmentData;
    }
  }

  getAssignments(administrationIds: string[]): Promise<IAssignmentData | undefined>[] {
    this._verifyAuthentication();
    return administrationIds.map((id) => this._getAssignment(id));
  }

  async startAssignment(administrationId: string) {
    this._verifyAuthentication();
    const assignmentDocRef = doc(this.dbRefs!.admin.assignments, administrationId);
    const userDocRef = this.dbRefs!.admin.user;
    return updateDoc(assignmentDocRef, { started: true }).then(() =>
      updateDoc(userDocRef, { [`assignmentsStarted.${administrationId}`]: new Date() }),
    );
  }

  async completeAssignment(administrationId: string) {
    this._verifyAuthentication();
    const assignmentDocRef = doc(this.dbRefs!.admin.assignments, administrationId);
    const userDocRef = this.dbRefs!.admin.user;
    return updateDoc(assignmentDocRef, { completed: true }).then(() =>
      updateDoc(userDocRef, { [`assignmentsCompleted.${administrationId}`]: new Date() }),
    );
  }

  private async _updateAssessment(administrationId: string, taskId: string, updates: { [x: string]: unknown }) {
    this._verifyAuthentication();
    const docRef = doc(this.dbRefs!.admin.assignments, administrationId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const assessmentInfo = docSnap.data().assessments.find((a: IAssignedAssessmentData) => a.taskId === taskId);
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
    this._verifyAuthentication();

    // First grab data about the administration
    const administrationDocRef = doc(this.admin!.db, 'administrations', administrationId);
    const administrationDocSnap = await getDoc(administrationDocRef);
    let assessmentParams: { [x: string]: unknown } = {};
    if (administrationDocSnap.exists()) {
      const assessments: IAssessmentData[] = administrationDocSnap.data().assessments;
      const thisAssessment = assessments.find((a) => a.taskId === taskId);
      if (thisAssessment) {
        assessmentParams = thisAssessment.params;
      } else {
        throw new Error(`Could not find assessment with taskId ${taskId} in administration ${administrationId}`);
      }

      // Create the run in the assessment Firestore, record the runId and then
      // pass it to the app
      const runRef = doc(this.dbRefs!.app.runs);
      const runId = runRef.id;

      // Check the assignment to see if none of the assessments have been
      // started yet. If not, start the assignment
      const assignmentDocRef = doc(this.dbRefs!.admin.assignments, administrationId);
      const assignmentDocSnap = await getDoc(assignmentDocRef);
      if (assignmentDocSnap.exists()) {
        const assignedAssessments = assignmentDocSnap.data().assessments as IAssignedAssessmentData[];
        const allRunIdsForThisTask = assignedAssessments.find((a) => a.taskId === taskId)?.allRunIds || [];
        if (!assignedAssessments.some((a: IAssignedAssessmentData) => Boolean(a.startedOn))) {
          this.startAssignment(administrationId);
        }
        allRunIdsForThisTask.push(runId);

        // Overwrite `runId` and append runId to `allRunIds` for this assessment
        // in the userId/assignments collection
        return this._updateAssessment(administrationId, taskId, {
          startedOn: new Date(),
          runId: runId,
          allRunIds: allRunIdsForThisTask,
        }).then(async () => {
          if (this.roarAppUserInfo === undefined) {
            this.getMyData();
          }

          const assigningOrgs = assignmentDocSnap.data().assigningOrgs;
          const taskAndVariant = await getTaskAndVariant({ db: this.app!.db, taskId, variantParams: assessmentParams });
          if (taskAndVariant.task === undefined) {
            throw new Error(`Could not find task ${taskId}`);
          }

          if (taskAndVariant.variant === undefined) {
            throw new Error(
              `Could not find a variant of task ${taskId} with the params: ${JSON.stringify(assessmentParams)}`,
            );
          }

          const taskName = taskAndVariant.task.name;
          const taskDescription = taskAndVariant.task.description;
          const variantName = taskAndVariant.variant.name;
          const variantDescription = taskAndVariant.variant.description;

          const taskInfo = {
            db: this.app!.db,
            taskId,
            taskName,
            taskDescription,
            variantName,
            variantDescription,
            variantParams: assessmentParams,
          };

          return new RoarAppkit({
            auth: this.app!.auth,
            userInfo: this.roarAppUserInfo!,
            assigningOrgs,
            runId,
            taskInfo,
          });
        });
      } else {
        throw new Error(
          `Could not find assignment for user ${this.roarUid} with administration id ${administrationId}`,
        );
      }
    } else {
      throw new Error(`Could not find administration with id ${administrationId}`);
    }
  }

  async completeAssessment(administrationId: string, taskId: string) {
    this._verifyAuthentication();
    await this._updateAssessment(administrationId, taskId, { completedOn: new Date() });

    // Check to see if all of the assessments in this assignment have been completed,
    // If so, complete the assignment
    const docRef = doc(this.dbRefs!.admin.assignments, administrationId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      if (docSnap.data().assessments.every((a: IAssignedAssessmentData) => Boolean(a.completedOn))) {
        this.completeAssignment(administrationId);
      }
    }
  }

  async updateAssessmentRewardShown(administrationId: string, taskId: string) {
    this._verifyAuthentication();
    return this._updateAssessment(administrationId, taskId, { rewardShown: true });
  }

  // These are all methods that will be important for admins, but not necessary for students
  async createAdministration(assessments: IAssessmentData[], dateOpen: Date, dateClose: Date, sequential = true) {
    this._verifyAuthentication();

    // First add the administration to the database
    const administrationData: IAdministrationData = {
      createdBy: this.roarUid!,
      users: [],
      studies: [],
      families: [],
      classes: [],
      schools: [],
      districts: [],
      grades: [],
      dateCreated: new Date(),
      dateOpened: dateOpen,
      dateClosed: dateClose,
      assessments: assessments,
      sequential: sequential,
    };
    const administrationDocRef = await addDoc(collection(this.admin!.db, 'administrations'), administrationData);

    // Then add the ID to the admin's list of administrationsCreated
    const userDocRef = this.dbRefs!.admin.user;
    await updateDoc(userDocRef, {
      'adminData.administrationsCreated': arrayUnion(administrationDocRef.id),
    });
  }

  async assignAdministrationToOrgs(administrationId: string, orgs: IOrgLists = emptyOrgList()) {
    this._verifyAuthentication();
    this._verify_admin();
    const docRef = doc(this.admin!.db, 'administrations', administrationId);

    await updateDoc(docRef, {
      districts: arrayUnion(orgs.districts),
      schools: arrayUnion(orgs.schools),
      classes: arrayUnion(orgs.classes),
      studies: arrayUnion(orgs.studies),
      families: arrayUnion(orgs.families),
    });
  }

  async unassignAdministrationToUsers(administrationId: string, orgs: IOrgLists = emptyOrgList()) {
    this._verifyAuthentication();
    this._verify_admin();

    const docRef = doc(this.admin!.db, 'administrations', administrationId);

    await updateDoc(docRef, {
      districts: arrayRemove(orgs.districts),
      schools: arrayRemove(orgs.schools),
      classes: arrayRemove(orgs.classes),
      studies: arrayRemove(orgs.studies),
      families: arrayRemove(orgs.families),
    });
  }

  async updateUserExternalData(uid: string, externalResourceId: string, externalData: IExternalUserData) {
    this._verifyAuthentication();
    this._verify_admin();

    const docRef = doc(this.admin!.db, 'users', uid, 'externalData', externalResourceId);
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

  async createStudentWithEmailPassword(email: string, password: string, userData: ICreateUserInput) {
    this._verifyAuthentication();
    this._verify_admin();

    const isEmailAvailable = await this.isEmailAvailable(email);
    if (isEmailAvailable) {
      if (!(_get(userData, 'age_year') || _get(userData, 'age_month') || _get(userData, 'dob'))) {
        throw new Error('Either age or date of birth must be supplied.');
      }

      const userDocData: IUserData = {
        userType: UserType.student,
        studentData: {} as IStudentData,
        districts: emptyOrg(),
        schools: emptyOrg(),
        classes: emptyOrg(),
        families: emptyOrg(),
        studies: emptyOrg(),
        archived: false,
      };

      if (_get(userData, 'name')) _set(userDocData, 'name', userData.name);
      if (!_get(userData, 'dob')) {
        let ageInMonths: number;
        if (_get(userData, 'age_year')) {
          ageInMonths = Math.round(Number(userData.age_year) * 12);
        } else if (_get(userData, 'age_month')) {
          ageInMonths = Math.round(Number(userData.age_month));
        }
        const calcDob = new Date();
        calcDob.setMonth(calcDob.getMonth() - ageInMonths!);
        _set(userDocData, 'studentData.dob', calcDob);
      }
      if (_get(userData, 'dob')) _set(userDocData, 'studentData.dob', userData.dob);
      if (_get(userData, 'gender')) _set(userDocData, 'studentData.gender', userData.gender);
      if (_get(userData, 'ell_status')) _set(userDocData, 'studentData.ell_status', userData.ell_status);
      if (_get(userData, 'iep_status')) _set(userDocData, 'studentData.iep_status', userData.iep_status);
      if (_get(userData, 'frl_status')) _set(userDocData, 'studentData.frl_status', userData.frl_status);

      const dateNow = Date.now();
      // create district entry
      const districtId = _get(userData, 'district');
      if (districtId) {
        _set(userDocData, 'districts', {
          current: [districtId],
          all: [districtId],
          dates: {
            [districtId!]: {
              from: dateNow,
              to: null,
            },
          },
        });
      }
      // create school entry
      const schoolId = _get(userData, 'school');
      if (schoolId) {
        _set(userDocData, 'schools', {
          current: [schoolId],
          all: [schoolId],
          dates: {
            [schoolId!]: {
              from: dateNow,
              to: null,
            },
          },
        });
      }
      // create class entry
      const classId = _get(userData, 'class');
      if (classId) {
        _set(userDocData, 'classes', {
          current: [classId],
          all: [classId],
          dates: {
            [classId!]: {
              from: dateNow,
              to: null,
            },
          },
        });
      }
      const cloudCreateAdminStudent = httpsCallable(this.admin!.functions, 'createstudent');
      const adminResponse = await cloudCreateAdminStudent({ email, password, userDocData });
      const adminUid = _get(adminResponse, 'data.adminUid');

      const cloudCreateAppStudent = httpsCallable(this.app!.functions, 'createstudent');
      const appResponse = await cloudCreateAppStudent({ adminUid, email, password, userDocData });
      // cloud function returns all relevant Uids (since at this point, all of the associations and claims have been made)
      const assessmentUid = _get(appResponse, 'data.assessmentUid');

      const cloudUpdateUserClaims = httpsCallable(this.admin!.functions, 'associateAssessmentUid');
      await cloudUpdateUserClaims({ adminUid, assessmentUid });
    } else {
      // Email is not available, reject
      throw new Error(`The email ${email} is not available.`);
    }
  }

  async createStudentWithUsernamePassword(username: string, password: string, userData: ICreateUserInput) {
    this._verifyAuthentication();
    this._verify_admin();

    const isUsernameAvailable = await this.isUsernameAvailable(username);
    if (isUsernameAvailable) {
      const email = `${username}@roar-auth.com`;
      await this.createStudentWithEmailPassword(email, password, userData);
    } else {
      // Username is not available, reject
      throw new Error(`The username ${username} is not available.`);
    }
  }
}
