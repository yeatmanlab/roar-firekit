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
import {
  AuthError,
  GoogleAuthProvider,
  OAuthProvider,
  ProviderId,
  createUserWithEmailAndPassword,
  getIdToken,
  getRedirectResult,
  isSignInWithEmailLink,
  onAuthStateChanged,
  onIdTokenChanged,
  sendSignInLinkToEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  Transaction,
  Unsubscribe,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { fetchEmailAuthMethods, isEmailAvailable, isRoarAuthEmail, isUsernameAvailable, roarEmail } from '../auth';
import { AuthPersistence, MarkRawConfig, crc32String, emptyOrg, emptyOrgList, initializeFirebaseProject } from './util';
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
  IOrg,
  IOrgLists,
  IStudentData,
  OrgType,
  IName,
} from './interfaces';
import { IUserInput } from './app/user';
import { RoarAppkit } from './app/appkit';
import { getOrganizations, getTaskAndVariant, getTasks, getVariants } from './query-assessment';
import { getAdministrations } from './query-admin';

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
  ROAR_ADMIN_PROJECT: 'oidc.gse-roar-admin',
};

interface ICreateUserInput {
  dob: string;
  grade: string;
  pid?: string;
  ell_status?: boolean;
  iep_status?: boolean;
  frl_status?: boolean;
  state_id?: string;
  gender?: string;
  hispanic_ethnicity?: string;
  race?: string[];
  home_language?: string[];
  name?: {
    first?: string;
    middle?: string;
    last?: string;
  };
  school: string | null;
  district: string | null;
  class: string | null;
  family: string | null;
  group: string | null;
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
  private _userDocListener?: Unsubscribe;
  private _adminClaimsListener?: Unsubscribe;
  private _appClaimsListener?: Unsubscribe;
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
    this._superAdmin = undefined;
    this.currentAssignments = undefined;
    this.oAuthAccessToken = undefined;
    this._adminClaimsListener = undefined;
    this._appClaimsListener = undefined;
    this._userDocListener = undefined;
  }

  async init() {
    this.app = await initializeFirebaseProject(this.roarConfig.app, 'app', this._authPersistence, this._markRawConfig);

    this.admin = await initializeFirebaseProject(
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
          this._adminClaimsListener = this._listenToClaims(this.admin);
          if (this.app?.user) {
            this._userDocListener = this._listenToUserDoc();
          }
        } else {
          this.admin.user = undefined;
          if (this._adminClaimsListener) this._adminClaimsListener();
          if (this._userDocListener) this._userDocListener();
          this._scrubAuthProperties();
        }
      }
    });

    onAuthStateChanged(this.app.auth, (user) => {
      if (this.app) {
        if (user) {
          this.app.user = user;
          this._appClaimsListener = this._listenToClaims(this.app);
          if (this.admin?.user) {
            this._userDocListener = this._listenToUserDoc();
          }
        } else {
          this.app.user = undefined;
          if (this._appClaimsListener) this._appClaimsListener();
          if (this._userDocListener) this._userDocListener();
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

  isAdmin() {
    if (this.superAdmin) return true;
    if (this._adminOrgs === undefined) return false;
    if (_isEmpty(_union(...Object.values(this._adminOrgs)))) return false;
    return true;
  }

  private _verifyAuthentication() {
    this._verifyInit();
    if (!this._isAuthenticated()) {
      throw new Error('User is not authenticated.');
    }
  }

  private _verifyAdmin() {
    this._verifyAuthentication();
    if (!this.isAdmin()) {
      throw new Error('User is not an administrator.');
    }
  }

  private _listenToUserDoc() {
    this._verifyAuthentication();
    if (this.dbRefs && !this._userDocListener) {
      return onSnapshot(this.dbRefs.admin.user, () => {
        this.getMyData();
      });
    }
  }

  private _listenToClaims(firekit: IFirekit) {
    this._verifyInit();
    if (firekit.user) {
      return onSnapshot(doc(firekit.db, 'userClaims', firekit.user!.uid), (doc) => {
        const data = doc.data();
        if (data?.lastUpdated) {
          const lastUpdated = new Date(data!.lastUpdated);
          if (!firekit.claimsLastUpdated || lastUpdated > firekit.claimsLastUpdated) {
            // Update the user's ID token and refresh claimsLastUpdated.
            firekit.user!.getIdToken(true);
            firekit.claimsLastUpdated = lastUpdated;
          }
        }
      });
    }
  }

  private _listenToTokenChange(firekit: IFirekit) {
    this._verifyInit();
    onIdTokenChanged(firekit.auth, async (user) => {
      if (user) {
        const idTokenResult = await user.getIdTokenResult(false);
        this._adminOrgs = idTokenResult.claims.adminOrgs;
        this._superAdmin = Boolean(idTokenResult.claims.super_admin);
      }
    });
  }

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

    return appResult;
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

  async fetchEmailAuthMethods(email: string) {
    this._verifyInit();
    return fetchEmailAuthMethods(this.admin!.auth, email);
  }

  isRoarAuthEmail(email: string) {
    this._verifyInit();
    return isRoarAuthEmail(email);
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

  async initiateLoginWithEmailLink({ email, redirectUrl }: { email: string; redirectUrl: string }) {
    this._verifyInit();
    const actionCodeSettings = {
      url: redirectUrl,
      handleCodeInApp: true,
    };
    return sendSignInLinkToEmail(this.admin!.auth, email, actionCodeSettings);
  }

  async isSignInWithEmailLink(emailLink: string) {
    this._verifyInit();
    return isSignInWithEmailLink(this.admin!.auth, emailLink);
  }

  async signInWithEmailLink({ email, emailLink }: { email: string; emailLink: string }) {
    this._verifyInit();
    return signInWithEmailLink(this.admin!.auth, email, emailLink)
      .then(async (userCredential) => {
        const roarAdminProvider = new OAuthProvider(RoarProviderId.ROAR_ADMIN_PROJECT);
        const roarAdminIdToken = await getIdToken(userCredential.user);
        const roarAdminCredential = roarAdminProvider.credential({
          idToken: roarAdminIdToken,
        });

        return roarAdminCredential;
      })
      .then((credential) => {
        if (credential) {
          return signInWithCredential(this.app!.auth, credential);
        }
      })
      .then((credential) => {
        if (credential) {
          return this._setUidCustomClaims();
        }
      });
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
      .then(async (adminUserCredential) => {
        if (provider === AuthProviderType.GOOGLE) {
          const credential = GoogleAuthProvider.credentialFromResult(adminUserCredential);
          // This gives you a Google Access Token. You can use it to access Google APIs.
          // TODO: Find a way to put this in the onAuthStateChanged handler
          oAuthAccessToken = credential?.accessToken;
          return credential;
        } else if (provider === AuthProviderType.CLEVER) {
          const credential = OAuthProvider.credentialFromResult(adminUserCredential);
          // This gives you a Clever Access Token. You can use it to access Clever APIs.
          // TODO: Find a way to put this in the onAuthStateChanged handler
          oAuthAccessToken = credential?.accessToken;

          const roarAdminProvider = new OAuthProvider(RoarProviderId.ROAR_ADMIN_PROJECT);
          const roarAdminIdToken = await getIdToken(adminUserCredential.user);
          const roarAdminCredential = roarAdminProvider.credential({
            idToken: roarAdminIdToken,
          });

          return roarAdminCredential;
        }
      })
      .catch(swallowAllowedErrors)
      .then((credential) => {
        if (credential) {
          return signInWithCredential(this.app!.auth, credential).catch(swallowAllowedErrors);
        }
      })
      .then((credential) => {
        if (credential) {
          return this._setUidCustomClaims();
        }
      })
      .then((setClaimsResult) => {
        if (setClaimsResult) {
          this._syncCleverData(oAuthAccessToken, provider);
        }
      });
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
      .then(async (adminUserCredential) => {
        if (adminUserCredential !== null) {
          const providerId = adminUserCredential.providerId;
          if (providerId === RoarProviderId.GOOGLE) {
            const credential = GoogleAuthProvider.credentialFromResult(adminUserCredential);
            // This gives you a Google Access Token. You can use it to access Google APIs.
            // TODO: Find a way to put this in the onAuthStateChanged handler
            authProvider = AuthProviderType.GOOGLE;
            oAuthAccessToken = credential?.accessToken;
            return credential;
          } else if (providerId === RoarProviderId.CLEVER) {
            const credential = OAuthProvider.credentialFromResult(adminUserCredential);
            // This gives you a Clever Access Token. You can use it to access Clever APIs.
            // TODO: Find a way to put this in the onAuthStateChanged handler
            authProvider = AuthProviderType.CLEVER;
            oAuthAccessToken = credential?.accessToken;

            const roarAdminProvider = new OAuthProvider(RoarProviderId.ROAR_ADMIN_PROJECT);
            const roarAdminIdToken = await getIdToken(adminUserCredential.user);
            const roarAdminCredential = roarAdminProvider.credential({
              idToken: roarAdminIdToken,
            });

            return roarAdminCredential;
          }
        }
      })
      .catch(catchEnableCookiesError)
      .then((credential) => {
        if (credential) {
          return signInWithCredential(this.app!.auth, credential);
        }
      })
      .then((credential) => {
        if (credential) {
          return this._setUidCustomClaims();
        }
      })
      .then((setClaimsResult) => {
        if (setClaimsResult) {
          this._syncCleverData(oAuthAccessToken, authProvider);
        }
      });
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
          tasks: collection(this.app.db, 'tasks'),
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
        groups: emptyOrg(),
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
        completed: _keys(this.userData?.assignmentsCompleted),
      };

      // Create a list of all assignments
      const allAssignments = _union(...Object.values(this.currentAssignments)) as string[];
      // Map that list into an object with the assignment IDs as the keys and the
      // assignment data as the values
      const assignmentInfo = _fromPairs(
        await Promise.all(
          _map(allAssignments, async (assignment) => {
            return this._getAssignment(assignment).then((assignmentData) => [assignment, assignmentData]);
          }),
        ),
      );

      // Loop through the assignments and filter out non-current ones
      const now = new Date();
      for (const assignmentStatus in this.currentAssignments) {
        const key = assignmentStatus as keyof ICurrentAssignments;
        this.currentAssignments[key] = _filter(this.currentAssignments[key], (assignmentId) => {
          const { dateOpened, dateClosed } = assignmentInfo[assignmentId];
          return dateOpened.toDate() < now && dateClosed.toDate() > now;
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
    throw new Error('Method not currently implemented.');
    // this._verifyAuthentication();
    //
    // const userCollectionRef = collection(this.admin.db, 'users');
    // const userQuery = query(
    //   userCollectionRef,
    //   or(
    //     where('districts', 'array-contains', this.roarUid!),
    //     where('schools', 'array-contains', this.roarUid!),
    //     where('classes', 'array-contains', this.roarUid!),
    //     where('groups', 'array-contains', this.roarUid!),
    //     where('families', 'array-contains', this.roarUid!),
    //   ),
    // );
    // // TODO: Query all users within this user's admin orgs
    // // TODO: Append the current user's uid to the list of UIDs
    // return null;
  }

  async getLegalDoc(docName: string) {
    const docRef = doc(this.admin!.db, 'legal', docName);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const gitHubUrl = `https://raw.githubusercontent.com/${_get(data, 'gitHubOrg')}/${_get(
        data,
        'gitHubRepository',
      )}/${_get(data, 'currentCommit')}/${_get(data, 'fileName')}`;
      try {
        const response = await fetch(gitHubUrl);
        const legalText = await response.text();
        return {
          text: legalText,
          version: _get(data, 'currentCommit'),
        };
      } catch (e) {
        throw new Error('Error retrieving consent document from GitHub.');
      }
    } else {
      return null;
    }
  }

  async updateConsentStatus(docName: string, consentVersion: string) {
    updateDoc(this.dbRefs!.admin.user, {
      [`legal.${docName}.${consentVersion}`]: new Date(),
    });
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
      const docData = docSnap.data() as IAssignmentData;
      const assessments = _get(docData, 'assessments', []);
      // Loop through these assessments and append their task data to docData
      const extendedAssessmentData = await Promise.all(
        assessments.map(async (assessment) => {
          const taskDocRef = doc(this.dbRefs!.app.tasks, assessment.taskId);
          const taskDocSnap = await getDoc(taskDocRef);
          if (taskDocSnap.exists()) {
            return {
              ...assessment,
              taskData: taskDocSnap.data(),
            };
          }
        }),
      );
      return {
        ...docData,
        assessments: extendedAssessmentData,
      } as IAssignmentData;
    }
  }

  async getAssignments(administrationIds: string[]): Promise<(IAssignmentData | undefined)[]> {
    this._verifyAuthentication();
    return await Promise.all(_map(administrationIds, async (id) => await this._getAssignment(id)));
  }

  async startAssignment(administrationId: string, transaction?: Transaction) {
    this._verifyAuthentication();
    const assignmentDocRef = doc(this.dbRefs!.admin.assignments, administrationId);

    if (transaction) {
      return transaction.update(assignmentDocRef, { started: true });
    } else {
      return updateDoc(assignmentDocRef, { started: true });
    }
  }

  async completeAssignment(administrationId: string, transaction?: Transaction) {
    this._verifyAuthentication();
    const assignmentDocRef = doc(this.dbRefs!.admin.assignments, administrationId);

    if (transaction) {
      return transaction.update(assignmentDocRef, { completed: true });
    } else {
      return updateDoc(assignmentDocRef, { completed: true });
    }
  }

  private async _updateAssignedAssessment(
    administrationId: string,
    taskId: string,
    updates: { [x: string]: unknown },
    transaction: Transaction,
  ) {
    this._verifyAuthentication();
    const docRef = doc(this.dbRefs!.admin.assignments, administrationId);
    const docSnap = await transaction.get(docRef);
    if (docSnap.exists()) {
      const assessments: IAssignedAssessmentData[] = docSnap.data().assessments;
      const assessmentIdx = assessments.findIndex((a) => a.taskId === taskId);
      const oldAssessmentInfo = assessments[assessmentIdx];
      const newAssessmentInfo = {
        ...oldAssessmentInfo,
        ...updates,
      };
      assessments[assessmentIdx] = newAssessmentInfo;
      return transaction.update(docRef, { assessments });
    } else {
      return transaction;
    }
  }

  async startAssessment(administrationId: string, taskId: string) {
    this._verifyAuthentication();

    const appKit = await runTransaction(this.admin!.db, async (transaction) => {
      // First grab data about the administration
      const administrationDocRef = doc(this.admin!.db, 'administrations', administrationId);
      const administrationDocSnap = await transaction.get(administrationDocRef);
      if (administrationDocSnap.exists()) {
        let assessmentParams: { [x: string]: unknown } = {};
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
        const assignmentDocSnap = await transaction.get(assignmentDocRef);
        if (assignmentDocSnap.exists()) {
          const assignedAssessments = assignmentDocSnap.data().assessments as IAssignedAssessmentData[];
          const allRunIdsForThisTask = assignedAssessments.find((a) => a.taskId === taskId)?.allRunIds || [];
          allRunIdsForThisTask.push(runId);

          // Overwrite `runId` and append runId to `allRunIds` for this assessment
          // in the userId/assignments collection
          await this._updateAssignedAssessment(
            administrationId,
            taskId,
            {
              startedOn: new Date(),
              runId: runId,
              allRunIds: allRunIdsForThisTask,
            },
            transaction,
          );

          if (!assignedAssessments.some((a: IAssignedAssessmentData) => Boolean(a.startedOn))) {
            await this.startAssignment(administrationId, transaction);
          }

          if (this.roarAppUserInfo === undefined) {
            this.getMyData();
          }

          const assigningOrgs = assignmentDocSnap.data().assigningOrgs;
          const taskAndVariant = await getTaskAndVariant({
            db: this.app!.db,
            taskId,
            variantParams: assessmentParams,
          });
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
            firebaseProject: this.app,
            userInfo: this.roarAppUserInfo!,
            assigningOrgs,
            runId,
            taskInfo,
          });
        } else {
          throw new Error(
            `Could not find assignment for user ${this.roarUid} with administration id ${administrationId}`,
          );
        }
      } else {
        throw new Error(`Could not find administration with id ${administrationId}`);
      }
    });

    return appKit;
  }

  async completeAssessment(administrationId: string, taskId: string) {
    this._verifyAuthentication();
    await runTransaction(this.admin!.db, async (transaction) => {
      // Check to see if all of the assessments in this assignment have been completed,
      // If so, complete the assignment
      const docRef = doc(this.dbRefs!.admin.assignments, administrationId);
      const docSnap = await transaction.get(docRef);

      // Update this assignment's `completedOn` timestamp
      await this._updateAssignedAssessment(administrationId, taskId, { completedOn: new Date() }, transaction);

      if (docSnap.exists()) {
        // Now check to see if all of the assessments in this assignment have
        // been completed.  Because we do this all in one transaction, we have
        // to put the `.get` call before any `.update` or `.set` calls. Thus, in
        // the `docSnap` that we are referencing below, the current assessment
        // will not have a `completedOn` timestamp yet (we set that after we
        // called `.get`).  We therefore check to see if all of the assessments
        // have been completed **or** have the current taskId.
        if (
          docSnap
            .data()
            .assessments.every((a: IAssignedAssessmentData) => Boolean(a.completedOn) || a.taskId === taskId)
        ) {
          this.completeAssignment(administrationId, transaction);
        }
      }
    });
  }

  async updateAssessmentRewardShown(administrationId: string, taskId: string) {
    this._verifyAuthentication();
    await runTransaction(this.admin!.db, async (transaction) => {
      this._updateAssignedAssessment(administrationId, taskId, { rewardShown: true }, transaction);
    });
  }

  // These are all methods that will be important for admins, but not necessary for students
  async createAdministration({
    name,
    assessments,
    dateOpen,
    dateClose,
    sequential = true,
    orgs = emptyOrgList(),
  }: {
    name: string;
    assessments: IAssessmentData[];
    dateOpen: Date;
    dateClose: Date;
    sequential: boolean;
    orgs: IOrgLists;
  }) {
    this._verifyAuthentication();

    // First add the administration to the database
    const administrationData: IAdministrationData = {
      name,
      createdBy: this.roarUid!,
      groups: orgs.groups ?? [],
      families: orgs.families ?? [],
      classes: orgs.classes ?? [],
      schools: orgs.schools ?? [],
      districts: orgs.districts ?? [],
      dateCreated: new Date(),
      dateOpened: dateOpen,
      dateClosed: dateClose,
      assessments: assessments,
      sequential: sequential,
    };
    await runTransaction(this.admin!.db, async (transaction) => {
      // Create the administration doc in the admin Firestore,
      const administrationDocRef = doc(collection(this.admin!.db, 'administrations'));
      transaction.set(administrationDocRef, administrationData);

      // Then add the ID to the admin's list of administrationsCreated
      const userDocRef = this.dbRefs!.admin.user;
      transaction.update(userDocRef, {
        'adminData.administrationsCreated': arrayUnion(administrationDocRef.id),
      });
    });
  }

  async assignAdministrationToOrgs(administrationId: string, orgs: IOrgLists = emptyOrgList()) {
    this._verifyAuthentication();
    this._verifyAdmin();
    const docRef = doc(this.admin!.db, 'administrations', administrationId);

    await updateDoc(docRef, {
      districts: arrayUnion(...orgs.districts),
      schools: arrayUnion(...orgs.schools),
      classes: arrayUnion(...orgs.classes),
      groups: arrayUnion(...orgs.groups),
      families: arrayUnion(...orgs.families),
    });
  }

  async unassignAdministrationToOrgs(administrationId: string, orgs: IOrgLists = emptyOrgList()) {
    this._verifyAuthentication();
    this._verifyAdmin();

    const docRef = doc(this.admin!.db, 'administrations', administrationId);

    await updateDoc(docRef, {
      districts: arrayRemove(...orgs.districts),
      schools: arrayRemove(...orgs.schools),
      classes: arrayRemove(...orgs.classes),
      groups: arrayRemove(...orgs.groups),
      families: arrayRemove(...orgs.families),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateUserExternalData(uid: string, externalResourceId: string, externalData: IExternalUserData) {
    throw new Error('Method not currently implemented.');
    // this._verifyAuthentication();
    // this._verifyAdmin();

    // const docRef = doc(this.admin!.db, 'users', uid, 'externalData', externalResourceId);
    // const docSnap = await getDoc(docRef);
    // if (docSnap.exists()) {
    //   // We use the dot-object module to transform the potentially nested external data to
    //   // dot notation. This prevents overwriting extisting external data.
    //   // See the note about dot notation in https://firebase.google.com/docs/firestore/manage-data/add-data#update_fields_in_nested_objects
    //   await updateDoc(
    //     docRef,
    //     removeNull(
    //       dot.dot({
    //         [externalResourceId]: externalData,
    //       }),
    //     ),
    //   );
    // } else {
    //   await setDoc(docRef, removeNull(externalData));
    // }
  }

  async createStudentWithEmailPassword(email: string, password: string, userData: ICreateUserInput, pidPrefix = '') {
    this._verifyAuthentication();
    this._verifyAdmin();

    const isEmailAvailable = await this.isEmailAvailable(email);
    if (isEmailAvailable) {
      if (!_get(userData, 'dob')) {
        throw new Error('Student date of birth must be supplied.');
      }

      const userDocData: IUserData = {
        userType: UserType.student,
        studentData: {} as IStudentData,
        districts: emptyOrg(),
        schools: emptyOrg(),
        classes: emptyOrg(),
        families: emptyOrg(),
        groups: emptyOrg(),
        archived: false,
      };

      if (_get(userData, 'pid')) {
        _set(userDocData, 'assessmentPid', userData.pid);
      } else {
        const emailCheckSum = crc32String(email);
        _set(userDocData, 'assessmentPid', pidPrefix + emailCheckSum);
      }

      // TODO: this can probably be optimized.
      if (_get(userData, 'name')) _set(userDocData, 'name', userData.name);
      if (_get(userData, 'dob')) _set(userDocData, 'studentData.dob', userData.dob);
      if (_get(userData, 'gender')) _set(userDocData, 'studentData.gender', userData.gender);
      if (_get(userData, 'grade')) _set(userDocData, 'studentData.grade', userData.grade);
      if (_get(userData, 'state_id')) _set(userDocData, 'studentData.state_id', userData.state_id);
      if (_get(userData, 'hispanic_ethnicity'))
        _set(userDocData, 'studentData.hispanic_ethnicity', userData.hispanic_ethnicity);
      if (_get(userData, 'ell_status')) _set(userDocData, 'studentData.ell_status', userData.ell_status);
      if (_get(userData, 'iep_status')) _set(userDocData, 'studentData.iep_status', userData.iep_status);
      if (_get(userData, 'frl_status')) _set(userDocData, 'studentData.frl_status', userData.frl_status);
      if (_get(userData, 'race')) _set(userDocData, 'studentData.race', userData.race);
      if (_get(userData, 'home_language')) _set(userDocData, 'studentData.home_language', userData.home_language);

      if (_get(userData, 'district')) _set(userDocData, 'orgIds.district', userData.district);
      if (_get(userData, 'school')) _set(userDocData, 'orgIds.school', userData.school);
      if (_get(userData, 'class')) _set(userDocData, 'orgIds.class', userData.class);
      if (_get(userData, 'group')) _set(userDocData, 'orgIds.group', userData.group);
      if (_get(userData, 'family')) _set(userDocData, 'orgIds.family', userData.family);

      const cloudCreateAdminStudent = httpsCallable(this.admin!.functions, 'createstudentaccount');
      const adminResponse = await cloudCreateAdminStudent({ email, password, userData: userDocData });
      const adminUid = _get(adminResponse, 'data.adminUid');

      const cloudCreateAppStudent = httpsCallable(this.app!.functions, 'createstudentaccount');
      const appResponse = await cloudCreateAppStudent({ adminUid, email, password, userData: userDocData });
      // cloud function returns all relevant Uids (since at this point, all of the associations and claims have been made)
      const assessmentUid = _get(appResponse, 'data.assessmentUid');

      const cloudUpdateUserClaims = httpsCallable(this.admin!.functions, 'associateassessmentuid');
      await cloudUpdateUserClaims({ adminUid, assessmentUid });
    } else {
      // Email is not available, reject
      throw new Error(`The email ${email} is not available.`);
    }
  }

  async createStudentWithUsernamePassword(
    username: string,
    password: string,
    userData: ICreateUserInput,
    pidPrefix = '',
  ) {
    this._verifyAuthentication();
    this._verifyAdmin();

    const isUsernameAvailable = await this.isUsernameAvailable(username);
    if (isUsernameAvailable) {
      const email = `${username}@roar-auth.com`;
      await this.createStudentWithEmailPassword(email, password, userData, pidPrefix);
    } else {
      // Username is not available, reject
      throw new Error(`The username ${username} is not available.`);
    }
  }

  async createAdministrator(email: string, name: IName, targetOrgs: IOrgLists, targetAdminOrgs: IOrgLists) {
    this._verifyAuthentication();
    this._verifyAdmin();

    const cloudCreateAdministrator = httpsCallable(this.admin!.functions, 'createAdministratorAccount');
    const adminResponse = await cloudCreateAdministrator({
      email,
      name,
      orgs: targetOrgs,
      adminOrgs: targetAdminOrgs,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (_get(adminResponse.data as any, 'status') !== 'ok') {
      throw new Error('Failed to create administrator user account.');
    }
  }

  async getTasks(requireRegistered = true) {
    this._verifyAuthentication();
    return getTasks(this.app!.db, requireRegistered);
  }

  async getVariants(requireRegistered = true) {
    this._verifyAuthentication();
    return getVariants(this.app!.db, requireRegistered);
  }

  async getMyAdministrations(includeStats = true) {
    this._verifyAuthentication();
    if (this._superAdmin || this._adminOrgs) {
      return getAdministrations({
        db: this.admin!.db,
        isSuperAdmin: this._superAdmin || false,
        orgs: (this._adminOrgs as IOrgLists) || undefined,
        includeStats,
      });
    } else {
      throw new Error('You must be an admin to get organizations.');
    }
  }

  async getOrgs(orgType: OrgType) {
    this._verifyAuthentication();
    if (this._superAdmin) {
      return getOrganizations(this.admin!.db, orgType);
    } else if (this._adminOrgs) {
      const orgIds = this._adminOrgs[orgType];
      // If orgType is school or class, and the user has district or school
      // admin orgs, we must add all subordinate orgs to the orgIds.
      // For example,
      return getOrganizations(this.admin!.db, orgType, orgIds);
    } else {
      throw new Error('You must be an admin to get organizations.');
    }
  }

  async createOrg(orgType: OrgType, orgData: IOrg) {
    this._verifyAuthentication();
    this._verifyAdmin();
    await addDoc(collection(this.admin!.db, orgType), orgData).then((docRef) => {
      return setDoc(collection(this.app!.db, orgType, docRef.id), orgData);
    });
  }

  // async createAdminUser(userData: IUserData) {
  //   this._verifyAuthentication();
  //   this._verifyAdmin();

  // }
}
