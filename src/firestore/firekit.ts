/* eslint-disable @typescript-eslint/no-non-null-assertion */
import _get from 'lodash/get';
import _set from 'lodash/set';
import _isEmpty from 'lodash/isEmpty';
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
  DocumentData,
  DocumentReference,
  Timestamp,
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
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { fetchEmailAuthMethods, isRoarAuthEmail, isEmailAvailable, isUsernameAvailable, roarEmail } from '../auth';
import { AuthPersistence, MarkRawConfig, crc32String, emptyOrg, emptyOrgList, initializeFirebaseProject } from './util';
import {
  Administration,
  Assessment,
  AssignedAssessment,
  ExternalUserData,
  FirebaseProject,
  Name,
  RoarOrg,
  OrgLists,
  RoarConfig,
  StudentData,
  UserDataInAdminDb,
  OrgCollectionName,
  UserType,
} from './interfaces';
import { UserInput } from './app/user';
import { RoarAppkit } from './app/appkit';
import { getTaskAndVariant } from './query-assessment';
import { TaskVariantInfo, RoarTaskVariant } from './app/task';

enum AuthProviderType {
  CLEVER = 'clever',
  CLASSLINK = 'classlink',
  GOOGLE = 'google',
  EMAIL = 'email',
  USERNAME = 'username',
}

interface CreateUserInput {
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
  username?: string;
  school: { id: string; abbreviation?: string } | null;
  district: { id: string; abbreviation?: string } | null;
  class: { id: string; abbreviation?: string } | null;
  family: { id: string; abbreviation?: string } | null;
  group: { id: string; abbreviation?: string } | null;
}

interface CreateParentInput {
  name: {
    first: string;
    last: string;
  };
}

export interface ChildData {
  email: string;
  password: string;
  userData: CreateUserInput;
  familyId: string;
  orgCode: string;
}

interface CurrentAssignments {
  assigned: string[];
  started: string[];
  completed: string[];
}

export interface RequestConfig {
  headers: { Authorization: string };
  baseURL: string;
}

interface LevanteUserData {
  id: string;
  userType: string;
  childId: string;
  parentId: string;
  teacherId: string;
  month: string;
  year: string;
  group: string[];
}

interface LevanteSurveyResponses {
  [key: string]: string;
}

export class RoarFirekit {
  admin?: FirebaseProject;
  app?: FirebaseProject;
  currentAssignments?: CurrentAssignments;
  oAuthAccessToken?: string;
  roarAppUserInfo?: UserInput;
  roarConfig: RoarConfig;
  userData?: UserDataInAdminDb;
  listenerUpdateCallback: (...args: unknown[]) => void;
  private _idTokenReceived?: boolean;
  private _idTokens: { admin?: string; app?: string };
  private _adminOrgs?: Record<string, string[]>;
  private _authPersistence: AuthPersistence;
  private _initialized: boolean;
  private _markRawConfig: MarkRawConfig;
  private _superAdmin?: boolean;
  private _verboseLogging?: boolean;
  private _adminTokenListener?: Unsubscribe;
  private _appTokenListener?: Unsubscribe;
  private _adminClaimsListener?: Unsubscribe;
  /**
   * Create a RoarFirekit. This expects an object with keys `roarConfig`,
   * where `roarConfig` is a [[RoarConfig]] object.
   * @param {{roarConfig: RoarConfig }=} destructuredParam
   *     roarConfig: The ROAR firebase config object
   */
  constructor({
    roarConfig,
    verboseLogging = false,
    authPersistence = AuthPersistence.session,
    markRawConfig = {},
    listenerUpdateCallback,
  }: {
    roarConfig: RoarConfig;
    dbPersistence: boolean;
    authPersistence?: AuthPersistence;
    markRawConfig?: MarkRawConfig;
    verboseLogging: boolean;
    listenerUpdateCallback?: (...args: unknown[]) => void;
  }) {
    this.roarConfig = roarConfig;
    this._verboseLogging = verboseLogging;
    this._authPersistence = authPersistence;
    this._markRawConfig = markRawConfig;
    this._initialized = false;
    this._idTokens = {};
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.listenerUpdateCallback = listenerUpdateCallback ?? (() => {});
  }

  private _getProviderIds() {
    return {
      ...ProviderId,
      CLEVER: 'oidc.clever',
      ROAR_ADMIN_PROJECT: `oidc.${this.roarConfig.admin.projectId}`,
    };
  }

  private _scrubAuthProperties() {
    this.userData = undefined;
    this.roarAppUserInfo = undefined;
    this._adminOrgs = undefined;
    this._superAdmin = undefined;
    this.currentAssignments = undefined;
    this.oAuthAccessToken = undefined;
    this._adminClaimsListener = undefined;
    this._adminTokenListener = undefined;
    this._appTokenListener = undefined;
    this._idTokens = {};
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
      this.verboseLog('onAuthStateChanged triggered for admin auth');
      if (this.admin) {
        if (user) {
          this.verboseLog('admin firebase instance and user are defined');
          this.admin.user = user;
          this._adminClaimsListener = this._listenToClaims(this.admin);
          this.verboseLog('adminClaimsListener instance set up using listenToClaims');
          this._adminTokenListener = this._listenToTokenChange(this.admin, 'admin');
          this.verboseLog('adminTokenListener instance set up using listenToClaims');
          this.verboseLog('[admin] Attempting to fire user.getIdToken(), existing token is', this._idTokens.admin);
          user.getIdToken().then((idToken) => {
            this.verboseLog('in .then() for user.getIdToken() with new token', idToken);
            this._idTokens.admin = idToken;
            this.verboseLog(`Updated internal admin token to ${idToken}`);
          });
        } else {
          this.verboseLog('User for admin is undefined.');
          this.admin.user = undefined;
        }
      }
      this.verboseLog('[admin] Call this.listenerUpdateCallback()');
      this.listenerUpdateCallback();
    });

    onAuthStateChanged(this.app.auth, (user) => {
      this.verboseLog('onAuthStateChanged triggered for assessment auth');
      if (this.app) {
        if (user) {
          this.verboseLog('assessment firebase instance and user are defiend');
          this.app.user = user;
          this._appTokenListener = this._listenToTokenChange(this.app, 'app');
          this.verboseLog('appTokenListener instance set up using listenToTokenChange');
          this.verboseLog(
            '[app] Attempting to fire user.getIdToken() from app , existing token is',
            this._idTokens.app,
          );
          user.getIdToken().then((idToken) => {
            this.verboseLog('in .then() for user.getItToken() with new token', idToken);
            this._idTokens.app = idToken;
            this.verboseLog('Updated internal app token to', idToken);
          });
        } else {
          this.verboseLog('User for app is undefined');
          this.app.user = undefined;
        }
      }
      this.verboseLog('[app] Call this.listenerUpdateCallback()');
      this.listenerUpdateCallback();
    });

    return this;
  }

  private verboseLog(...logStatement: unknown[]) {
    if (this._verboseLogging) {
      console.log('[RoarFirekit] ', ...logStatement);
    } else return;
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

  private _listenToClaims(firekit: FirebaseProject) {
    this.verboseLog('entry point to listenToClaims');
    this._verifyInit();
    if (firekit.user) {
      this.verboseLog('firekit.user is defined');
      let unsubscribe;
      this.verboseLog('About to try setting up the claims listener');
      try {
        this.verboseLog('Beginning onSnapshot definition');
        unsubscribe = onSnapshot(
          doc(firekit.db, 'userClaims', firekit.user!.uid),
          async (doc) => {
            this.verboseLog('In onSnapshot call for listenToClaims');
            const data = doc.data();
            this._adminOrgs = data?.claims?.adminOrgs;
            this._superAdmin = data?.claims?.super_admin;
            this.verboseLog('data, adminOrgs, superAdmin are retrieved from doc.data()');
            this.verboseLog('about to check for existance of data.lastUpdated');
            if (data?.lastUpdated) {
              this.verboseLog('lastUpdate exists.');
              const lastUpdated = new Date(data!.lastUpdated);
              this.verboseLog(
                'Checking for firekit.claimsLastUpdated existance or outdated (< lastUpdated from retrieved data)',
              );
              if (!firekit.claimsLastUpdated || lastUpdated > firekit.claimsLastUpdated) {
                this.verboseLog(
                  "Firekit's last updated either does not exist or is outdated. Await getIdToken and update firekit's claimsLastUpdated field.",
                );
                // Update the user's ID token and refresh claimsLastUpdated.
                await getIdToken(firekit.user!, true);
                firekit.claimsLastUpdated = lastUpdated;
              }
            }
            this.verboseLog('Call listenerUpdateCallback from listenToClaims');
            this.listenerUpdateCallback();
          },
          (error) => {
            throw error;
          },
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        this.verboseLog('Attempt to set up claims listener failed. Error is', error);
        if (error.code !== 'permission-denied') {
          throw error;
        }
      }
      return unsubscribe;
    }
  }

  private _listenToTokenChange(firekit: FirebaseProject, _type: 'admin' | 'app') {
    this.verboseLog('Entry point for listenToTokenChange, called with', _type);
    this._verifyInit();
    this.verboseLog('Checking for existance of tokenListener with type', _type);
    if ((!this._adminTokenListener && _type === 'admin') || (!this._appTokenListener && _type === 'app')) {
      this.verboseLog('Token listener does not exist, create now.');
      return onIdTokenChanged(firekit.auth, async (user) => {
        this.verboseLog('onIdTokenChanged body');
        if (user) {
          this.verboseLog('user exists, await user.getIdTokenResult(false)');
          const idTokenResult = await user.getIdTokenResult(false);
          this.verboseLog('Returned with token', idTokenResult);
          if (_type === 'admin') {
            this.verboseLog('Type is admin, set idTokenRecieved flag');
            this._idTokenReceived = true;
          }
          this.verboseLog(`Setting idTokens.${_type} to token`, idTokenResult.token);
          this._idTokens[_type] = idTokenResult.token;
        }
        this.verboseLog('Calling listenerUpdateCallback from listenToTokenChange', _type);
        this.listenerUpdateCallback();
      });
    } else if (_type === 'admin') {
      this.verboseLog('Type is admin, invoking _adminTokenListener');
      return this._adminTokenListener;
    }
    this.verboseLog('Type is app, invoking _appTokenListener');
    return this._appTokenListener;
  }

  private async _setUidCustomClaims() {
    this.verboseLog('Entry point to setUidCustomClaims');
    this._verifyAuthentication();

    this.verboseLog('Calling cloud function for setAdminUidClaims');
    const setAdminUidClaims = httpsCallable(this.admin!.functions, 'setuidclaims');
    const adminResult = await setAdminUidClaims({ assessmentUid: this.app!.user!.uid });
    this.verboseLog('setAdminUidClaims returned with result', adminResult);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (_get(adminResult.data as any, 'status') !== 'ok') {
      this.verboseLog('Error in calling setAdminUidClaims cloud function', adminResult.data);
      throw new Error('Failed to associate admin and assessment UIDs in the admin Firebase project.');
    }

    this.verboseLog('Calling cloud function for setAppUidClaims');
    const setAppUidClaims = httpsCallable(this.app!.functions, 'setuidclaims');
    const appResult = await setAppUidClaims({ adminUid: this.admin!.user!.uid, roarUid: this.roarUid! });
    this.verboseLog('setAppUidCustomClaims returned with results', appResult);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (_get(appResult.data as any, 'status') !== 'ok') {
      this.verboseLog('Error in calling setAppUidClaims cloud function', appResult.data);
      throw new Error('Failed to associate admin and assessment UIDs in the app Firebase project.');
    }

    this.verboseLog('Returning appResult from setUidCustomClaims', appResult);
    return appResult;
  }

  private async _syncCleverUser(oAuthAccessToken?: string, authProvider?: AuthProviderType) {
    this.verboseLog('Entry point for syncCleverUser');
    if (authProvider === AuthProviderType.CLEVER) {
      if (oAuthAccessToken === undefined) {
        this.verboseLog('Not OAuth token provided.');
        throw new Error('No OAuth access token provided.');
      }
      this._verifyAuthentication();
      this.verboseLog('Calling syncCleverUser cloud function');
      const syncCleverUser = httpsCallable(this.admin!.functions, 'syncCleverUser');
      const adminResult = await syncCleverUser({
        assessmentUid: this.app!.user!.uid,
        accessToken: oAuthAccessToken,
      });
      this.verboseLog('syncCleverUser cloud function returned with result', adminResult);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (_get(adminResult.data as any, 'status') !== 'ok') {
        this.verboseLog('There was an error with the cloud function syncCleverUser cloud function', adminResult.data);
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
        throw error;
      })
      .then(() => {
        return createUserWithEmailAndPassword(this.app!.auth, email, password).then(
          this._setUidCustomClaims.bind(this),
        );
      });
  }

  async logInWithEmailAndPassword({ email, password }: { email: string; password: string }) {
    this._verifyInit();
    return signInWithEmailAndPassword(this.admin!.auth, email, password)
      .then(() => {
        return signInWithEmailAndPassword(this.app!.auth, email, password)
          .then(this._setUidCustomClaims.bind(this))
          .catch((error: AuthError) => {
            console.error('(Inside) Error signing in', error);
            throw error;
          });
      })
      .catch((error: AuthError) => {
        console.error('(Outside) Error signing in', error);
        throw error;
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
        const roarProviderIds = this._getProviderIds();
        const roarAdminProvider = new OAuthProvider(roarProviderIds.ROAR_ADMIN_PROJECT);
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
      const roarProviderIds = this._getProviderIds();
      authProvider = new OAuthProvider(roarProviderIds.CLEVER);
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

          const roarProviderIds = this._getProviderIds();
          const roarAdminProvider = new OAuthProvider(roarProviderIds.ROAR_ADMIN_PROJECT);
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
          this._syncCleverUser(oAuthAccessToken, provider);
        }
      });
  }

  async initiateRedirect(provider: AuthProviderType) {
    this.verboseLog('Entry point for initiateRedirect');
    this._verifyInit();
    const allowedProviders = [AuthProviderType.GOOGLE, AuthProviderType.CLEVER];

    let authProvider;
    this.verboseLog('Attempting sign in with AuthProvider', provider);
    if (provider === AuthProviderType.GOOGLE) {
      authProvider = new GoogleAuthProvider();
      this.verboseLog('Google AuthProvider object:', authProvider);
    } else if (provider === AuthProviderType.CLEVER) {
      const roarProviderIds = this._getProviderIds();
      this.verboseLog('Clever roarProviderIds', roarProviderIds);
      authProvider = new OAuthProvider(roarProviderIds.CLEVER);
      this.verboseLog('Clever AuthProvider object:', authProvider);
    } else {
      this.verboseLog('Provider must be GOOGLE or CLEVER');
      throw new Error(`provider must be one of ${allowedProviders.join(', ')}. Received ${provider} instead.`);
    }

    this.verboseLog('Calling signInWithRedirect from initiateRedirect with provider', authProvider);
    return signInWithRedirect(this.admin!.auth, authProvider);
  }

  async signInFromRedirectResult(enableCookiesCallback: () => void) {
    this._verifyInit();
    this.verboseLog('Entry point for signInFromRedirectResult');
    const catchEnableCookiesError = (error: AuthError) => {
      this.verboseLog('Catching error, checking if it is the enableCookies error');
      if (error.code == 'auth/web-storage-unsupported') {
        this.verboseLog('Error was known enableCookies error, invoking enableCookiesCallback()');
        enableCookiesCallback();
      } else {
        this.verboseLog('It was not the known enableCookies error', error);
        throw error;
      }
    };

    let oAuthAccessToken: string | undefined;
    let authProvider: AuthProviderType | undefined;

    this.verboseLog('calling getRedirect result from signInFromRedirect');
    return getRedirectResult(this.admin!.auth)
      .then(async (adminUserCredential) => {
        this.verboseLog('Then block for getRedirectResult');
        if (adminUserCredential !== null) {
          this.verboseLog('adminUserCredential is not null');
          const providerId = adminUserCredential.providerId;
          const roarProviderIds = this._getProviderIds();
          this.verboseLog('providerId is', providerId);
          this.verboseLog('roarProviderIds are', roarProviderIds);
          if (providerId === roarProviderIds.GOOGLE) {
            this.verboseLog('ProviderId is google, calling credentialFromResult with ', adminUserCredential);
            const credential = GoogleAuthProvider.credentialFromResult(adminUserCredential);
            // This gives you a Google Access Token. You can use it to access Google APIs.
            // TODO: Find a way to put this in the onAuthStateChanged handler
            authProvider = AuthProviderType.GOOGLE;
            oAuthAccessToken = credential?.accessToken;
            this.verboseLog('oAuthAccessToken = ', oAuthAccessToken);
            this.verboseLog('returning credential from first .then() ->', credential);
            return credential;
          } else if (providerId === roarProviderIds.CLEVER) {
            this.verboseLog('ProviderId is clever, calling credentialFromResult with', adminUserCredential);
            const credential = OAuthProvider.credentialFromResult(adminUserCredential);
            // This gives you a Clever Access Token. You can use it to access Clever APIs.
            // TODO: Find a way to put this in the onAuthStateChanged handler
            authProvider = AuthProviderType.CLEVER;
            oAuthAccessToken = credential?.accessToken;
            this.verboseLog('authProvider is', authProvider);
            this.verboseLog('oAuthAccesToken is', oAuthAccessToken);

            const roarAdminProvider = new OAuthProvider(roarProviderIds.ROAR_ADMIN_PROJECT);
            this.verboseLog('Attempting to call getIdToken with', adminUserCredential.user);
            const roarAdminIdToken = await getIdToken(adminUserCredential.user);
            this.verboseLog('updated token is', roarAdminIdToken);
            const roarAdminCredential = roarAdminProvider.credential({
              idToken: roarAdminIdToken,
            });
            this.verboseLog(`Using new idToken ${roarAdminIdToken}, created new admin credential`, roarAdminCredential);

            return roarAdminCredential;
          }
        }
        return null;
      })
      .catch(catchEnableCookiesError)
      .then((credential) => {
        this.verboseLog('Attempting sign in using credential', credential);
        if (credential) {
          this.verboseLog('Calling signInWithCredential with creds', credential);
          return signInWithCredential(this.app!.auth, credential);
        }
        return null;
      })
      .then((credential) => {
        this.verboseLog('Attempting to set uid custom claims using credential', credential);
        if (credential) {
          this.verboseLog('Calling setUidCustomClaims with creds', credential);
          return this._setUidCustomClaims();
        }
        return null;
      })
      .then((setClaimsResult) => {
        this.verboseLog('Claim result is', setClaimsResult);
        if (setClaimsResult) {
          this.verboseLog('Calling syncCleverUser with oAuthAccessToken', oAuthAccessToken);
          this._syncCleverUser(oAuthAccessToken, authProvider);
          return { status: 'ok' };
        }
        return null;
      });
  }

  private async _signOutApp() {
    this._scrubAuthProperties();
    await signOut(this.app!.auth);
  }

  private async _signOutAdmin() {
    if (this._adminClaimsListener) this._adminClaimsListener();
    if (this._adminTokenListener) this._adminTokenListener();
    this._scrubAuthProperties();
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

  public get idTokenReceived() {
    return this._idTokenReceived;
  }

  public get idTokens() {
    return this._idTokens;
  }

  public get restConfig() {
    return {
      admin: {
        headers: { Authorization: `Bearer ${this._idTokens.admin}` },
        baseURL: `https://firestore.googleapis.com/v1/projects/${this.roarConfig.admin.projectId}/databases/(default)/documents`,
      },
      app: {
        headers: { Authorization: `Bearer ${this._idTokens.app}` },
        baseURL: `https://firestore.googleapis.com/v1/projects/${this.roarConfig.app.projectId}/databases/(default)/documents`,
      },
    };
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

  private async _getUser(uid: string): Promise<UserDataInAdminDb | undefined> {
    this._verifyAuthentication();
    const userDocRef = doc(this.admin!.db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const userData = {
        userType: UserType.guest,
        ...userDocSnap.data(),
      } as UserDataInAdminDb;

      const externalDataSnapshot = await getDocs(collection(userDocRef, 'externalData'));
      let externalData = {};
      externalDataSnapshot.forEach((doc) => {
        // doc.data() is never undefined for query doc snapshots returned by ``getDocs``
        externalData = {
          ...externalData,
          [doc.id]: doc.data() as ExternalUserData,
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
        testData: false,
        demoData: false,
      };
    }
  }

  async getMyData() {
    this._verifyInit();
    if (!this._isAuthenticated() || !this.roarUid) {
      return;
    }

    this.userData = await this._getUser(this.roarUid!);

    if (this.userData) {
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
        ...(this.userData.testData && { testData: true }),
        ...(this.userData.demoData && { demoData: true }),
      };
    }
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

  async updateVideoMetadata(administrationId: string, taskId: string, status: string) {
    this._verifyAuthentication();
    // Update this assignment's `videoWatched` timestamp
    if (status === 'started') {
      await runTransaction(this.admin!.db, async (transaction) => {
        await this._updateAssignedAssessment(administrationId, taskId, { videoStartedOn: new Date() }, transaction);
      });
    } else if (status === 'completed') {
      await runTransaction(this.admin!.db, async (transaction) => {
        await this._updateAssignedAssessment(administrationId, taskId, { videoCompletedOn: new Date() }, transaction);
      });
    }
  }

  public get roarUid() {
    return this.admin?.user?.uid;
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
      const assessments: AssignedAssessment[] = docSnap.data().assessments;
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
        const assessments: Assessment[] = administrationDocSnap.data().assessments;
        const thisAssessment = assessments.find((a) => a.taskId === taskId);
        if (thisAssessment) {
          assessmentParams = thisAssessment.params;
        } else {
          throw new Error(`Could not find assessment with taskId ${taskId} in administration ${administrationId}`);
        }

        // Check the assignment to see if none of the assessments have been
        // started yet. If not, start the assignment
        const assignmentDocRef = doc(this.dbRefs!.admin.assignments, administrationId);
        const assignmentDocSnap = await transaction.get(assignmentDocRef);
        if (assignmentDocSnap.exists()) {
          const assignedAssessments = assignmentDocSnap.data().assessments as AssignedAssessment[];
          const assessmentUpdateData = {
            startedOn: new Date(),
          };

          // Append runId to `allRunIds` for this assessment
          // in the userId/assignments collection
          await this._updateAssignedAssessment(administrationId, taskId, assessmentUpdateData, transaction);

          if (!assignedAssessments.some((a: AssignedAssessment) => Boolean(a.startedOn))) {
            await this.startAssignment(administrationId, transaction);
          }

          if (this.roarAppUserInfo === undefined) {
            await this.getMyData();
          }

          const assigningOrgs = assignmentDocSnap.data().assigningOrgs;
          const readOrgs = assignmentDocSnap.data().readOrgs;
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

          const { testData: isAssignmentTest, demoData: isAssignmentDemo } = assignmentDocSnap.data();
          const { testData: isUserTest, demoData: isUserDemo } = this.roarAppUserInfo!;
          const { testData: isTaskTest, demoData: isTaskDemo } = taskAndVariant.task;
          const { testData: isVariantTest, demoData: isVariantDemo } = taskAndVariant.variant;

          const taskInfo = {
            db: this.app!.db,
            taskId,
            taskName,
            taskDescription,
            variantName,
            variantDescription,
            variantParams: assessmentParams,
            testData: {
              task: isTaskTest ?? false,
              variant: isVariantTest ?? false,
            },
            demoData: {
              task: isTaskDemo ?? false,
              variant: isVariantDemo ?? false,
            },
          };

          return new RoarAppkit({
            firebaseProject: this.app,
            userInfo: this.roarAppUserInfo!,
            assigningOrgs,
            readOrgs,
            assignmentId: administrationId,
            taskInfo,
            testData: {
              user: isUserTest,
              task: isTaskTest,
              variant: isVariantTest,
              run: isAssignmentTest || isUserTest || isTaskTest || isVariantTest,
            },
            demoData: {
              user: isUserDemo,
              task: isTaskDemo,
              variant: isVariantDemo,
              run: isAssignmentDemo || isUserDemo || isTaskDemo || isVariantDemo,
            },
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
          docSnap.data().assessments.every((a: AssignedAssessment) => {
            return Boolean(a.completedOn) || a.optional || a.taskId === taskId;
          })
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
  /**
   * Create or update an administration
   *
   * @param input input object
   * @param input.name The administration name
   * @param input.assessments The list of assessments for this administration
   * @param input.dateOpen The start date for this administration
   * @param input.dateClose The end date for this administration
   * @param input.sequential Whether or not the assessments in this
   *                         administration must be taken sequentially
   * @param input.orgs The orgs assigned to this administration
   * @param input.tags Metadata tags for this administration
   * @param input.administrationId Optional ID of an existing administration. If
   *                               provided, this method will update an
   *                               existing administration.
   */
  async createAdministration({
    name,
    publicName,
    assessments,
    dateOpen,
    dateClose,
    sequential = true,
    orgs = emptyOrgList(),
    tags = [],
    administrationId,
    isTestData = false,
  }: {
    name: string;
    publicName?: string;
    assessments: Assessment[];
    dateOpen: Date;
    dateClose: Date;
    sequential: boolean;
    orgs: OrgLists;
    tags: string[];
    administrationId?: string;
    isTestData: boolean;
  }) {
    this._verifyAuthentication();
    this._verifyAdmin();

    if ([name, dateOpen, dateClose, assessments].some((param) => param === undefined || param === null)) {
      throw new Error('The parameters name, dateOpen, dateClose, and assessments are required');
    }

    if (dateClose < dateOpen) {
      throw new Error(
        `The end date cannot be before the start date: ${dateClose.toISOString()} < ${dateOpen.toISOString()}`,
      );
    }

    // First add the administration to the database
    const administrationData: Administration = {
      name,
      publicName: publicName ?? name,
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
      tags: tags,
    };

    if (isTestData) administrationData.testData = true;

    await runTransaction(this.admin!.db, async (transaction) => {
      let administrationDocRef: DocumentReference;
      if (administrationId !== undefined) {
        // Set the doc ref to the existing administration
        administrationDocRef = doc(this.admin!.db, 'administrations', administrationId);

        // Get the existing administration to make sure update is allowed.
        const docSnap = await transaction.get(administrationDocRef);
        if (docSnap.exists()) {
          const docData = docSnap.data() as Administration;
          const now = new Date();
          if ((docData.dateOpened as Timestamp).toDate() < now) {
            throw new Error('Cannot edit an administration that has already started.');
          }
        } else {
          throw new Error(`Could not find administration with id ${administrationId}`);
        }
      } else {
        // Create a new administration doc ref
        administrationDocRef = doc(collection(this.admin!.db, 'administrations'));
      }

      // Create the administration doc in the admin Firestore,
      transaction.set(administrationDocRef, administrationData, { merge: true });

      // Then add the ID to the admin's list of administrationsCreated
      const userDocRef = this.dbRefs!.admin.user;
      transaction.update(userDocRef, {
        'adminData.administrationsCreated': arrayUnion(administrationDocRef.id),
      });
    });
  }

  /**
   * Delete an administration
   *
   * @param administrationId The administration ID to delete
   */
  async deleteAdministration(administrationId: string) {
    this._verifyAuthentication();
    this._verifyAdmin();
    if (!this._superAdmin) {
      throw new Error('You must be a super admin to delete an administration.');
    }

    await runTransaction(this.admin!.db, async (transaction) => {
      const administrationDocRef = doc(this.admin!.db, 'administrations', administrationId);
      const statsDocRef = doc(administrationDocRef, 'stats', 'completion');

      const docSnap = await transaction.get(administrationDocRef);
      if (docSnap.exists()) {
        // Delete the stats/completion doc if it exists
        const statsDocSnap = await transaction.get(statsDocRef);
        if (statsDocSnap.exists()) {
          transaction.delete(statsDocRef);
        }

        // Delete the administration doc
        transaction.delete(administrationDocRef);
      }
    });
  }

  async assignAdministrationToOrgs(administrationId: string, orgs: OrgLists = emptyOrgList()) {
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

  async unassignAdministrationToOrgs(administrationId: string, orgs: OrgLists = emptyOrgList()) {
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
  async updateUserExternalData(uid: string, externalResourceId: string, externalData: ExternalUserData) {
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

  async createStudentWithEmailPassword(email: string, password: string, userData: CreateUserInput) {
    this._verifyAuthentication();
    this._verifyAdmin();

    if (!_get(userData, 'dob')) {
      throw new Error('Student date of birth must be supplied.');
    }

    const userDocData: UserDataInAdminDb = {
      userType: UserType.student,
      studentData: {} as StudentData,
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
      // If PID was not supplied, then construct one using an eight character
      // checksum of the email.
      // Prefix that checksum with optional org abbreviations:
      // 1. If the district has an abbreviation, start with that.
      // 2. Then add the school abbreviation, if it exists.
      // 3. If neither of those are available, use the group abbreviation.
      // 4. Otherwise prepend nothing.
      const emailCheckSum = crc32String(email);

      const districtPrefix = _get(userData, 'district.abbreviation');
      const schoolPrefix = _get(userData, 'school.abbreviation');
      const groupPrefix = _get(userData, 'group.abbreviation');

      const pidParts: string[] = [];
      if (districtPrefix) pidParts.push(districtPrefix);
      if (schoolPrefix) pidParts.push(schoolPrefix);
      if (pidParts.length === 0 && groupPrefix) pidParts.push(groupPrefix);
      pidParts.push(emailCheckSum);
      _set(userDocData, 'assessmentPid', pidParts.join('-'));
    }

    // TODO: this can probably be optimized.
    _set(userDocData, 'email', email);

    if (_get(userData, 'username')) _set(userDocData, 'username', userData.username);
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

    if (_get(userData, 'district')) _set(userDocData, 'orgIds.district', userData.district!.id);
    if (_get(userData, 'school')) _set(userDocData, 'orgIds.school', userData.school!.id);
    if (_get(userData, 'class')) _set(userDocData, 'orgIds.class', userData.class!.id);
    if (_get(userData, 'group')) _set(userDocData, 'orgIds.group', userData.group!.id);
    if (_get(userData, 'family')) _set(userDocData, 'orgIds.family', userData.family!.id);

    const cloudCreateStudent = httpsCallable(this.admin!.functions, 'createstudentaccount');
    await cloudCreateStudent({ email, password, userData: userDocData });
  }

  async createNewFamily(
    caretakerEmail: string,
    caretakerPassword: string,
    caretakerUserData: CreateParentInput,
    children: ChildData[],
    isTestData = false,
  ) {
    // Format children objects
    const formattedChildren = children.map((child) => {
      const returnChild = {
        email: child.email,
        password: child.password,
      };
      // Create a PID for the student.
      const emailCheckSum = crc32String(child.email!);
      const pidParts: string[] = [];
      pidParts.push(emailCheckSum);
      _set(returnChild, 'userData.assessmentPid', pidParts.join('-'));

      // Move attributes into the studentData object.
      _set(returnChild, 'userData.username', child.email.split('@')[0]);
      if (_get(child, 'userData.name')) _set(returnChild, 'userData.name', child.userData.name);
      if (_get(child, 'userData.gender')) _set(returnChild, 'userData.studentData.gender', child.userData.gender);
      if (_get(child, 'userData.grade')) _set(returnChild, 'userData.studentData.grade', child.userData.grade);
      if (_get(child, 'userData.dob')) _set(returnChild, 'userData.studentData.dob', child.userData.dob);
      if (_get(child, 'userData.state_id')) _set(returnChild, 'userData.studentData.state_id', child.userData.state_id);
      if (_get(child, 'userData.hispanic_ethnicity'))
        _set(returnChild, 'userData.studentData.hispanic_ethnicity', child.userData.hispanic_ethnicity);
      if (_get(child, 'userData.ell_status'))
        _set(returnChild, 'userData.studentData.ell_status', child.userData.ell_status);
      if (_get(child, 'userData.iep_status'))
        _set(returnChild, 'userData.studentData.iep_status', child.userData.iep_status);
      if (_get(child, 'userData.frl_status'))
        _set(returnChild, 'userData.studentData.frl_status', child.userData.frl_status);
      if (_get(child, 'userData.race')) _set(returnChild, 'userData.studentData.race', child.userData.race);
      if (_get(child, 'userData.home_language'))
        _set(returnChild, 'userData.studentData.home_language', child.userData.home_language);
      return returnChild;
    });

    // Call cloud function
    const cloudCreateFamily = httpsCallable(this.admin!.functions, 'createnewfamily');
    await cloudCreateFamily({
      caretakerEmail,
      caretakerPassword,
      caretakerUserData,
      children: formattedChildren,
      isTestData,
    });
  }

  async createStudentWithUsernamePassword(username: string, password: string, userData: CreateUserInput) {
    this._verifyAuthentication();
    this._verifyAdmin();

    const email = `${username}@roar-auth.com`;
    return this.createStudentWithEmailPassword(email, password, userData);
  }

  async createAdministrator(
    email: string,
    name: Name,
    targetOrgs: OrgLists,
    targetAdminOrgs: OrgLists,
    isTestData = false,
  ) {
    this._verifyAuthentication();
    this._verifyAdmin();

    const cloudCreateAdministrator = httpsCallable(this.admin!.functions, 'createAdministratorAccount');
    const adminResponse = await cloudCreateAdministrator({
      email,
      name,
      orgs: targetOrgs,
      adminOrgs: targetAdminOrgs,
      isTestData,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (_get(adminResponse.data as any, 'status') !== 'ok') {
      throw new Error('Failed to create administrator user account.');
    }
  }

  async syncCleverOrgs(shallow = false) {
    this._verifyAuthentication();
    if (!this._superAdmin) {
      throw new Error('You must be a super admin to sync Clever organizations.');
    }

    const syncCleverOrgs = httpsCallable(this.admin!.functions, 'syncCleverOrgs', { timeout: 300000 });
    const result = await syncCleverOrgs({ shallow });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (_get(result.data as any, 'status') !== 'ok') {
      throw new Error('Failed to sync Clever orgs.');
    }
  }

  /**
   * Create or update an organization.
   *
   * @param orgsCollection The type of organization to create or update.
   * @param orgData The organization data to create or update.
   * @param isTestData Whether or not this is a test org.
   * @param isDemoData Whether or not this is a demo org.
   * @param organizationId Optional ID of an existing org. If provided, this
   *                       method will update an existing org.
   * @returns The newly created or updated organization ID.
   */
  async createOrg(
    orgsCollection: OrgCollectionName,
    orgData: RoarOrg,
    isTestData = false,
    isDemoData = false,
    organizationId?: string,
  ) {
    this._verifyAuthentication();
    this._verifyAdmin();

    // Check that schools have a districtId
    if (orgsCollection === 'schools' && orgData.districtId === undefined) {
      throw new Error('You must specify a districtId when creating a school.');
    }

    // Check that classes have a schoolId
    if (orgsCollection === 'classes' && orgData.schoolId === undefined) {
      throw new Error('You must specify a schoolId when creating a class.');
    }

    return runTransaction(this.admin!.db, async (transaction) => {
      // If org is a class, retrieve the districtId from the parent school
      if (orgsCollection === 'classes') {
        const schoolDocRef = doc(this.admin!.db, 'schools', orgData.schoolId as string);
        const districtId = await transaction.get(schoolDocRef).then((snapshot) => {
          if (snapshot.exists()) {
            return snapshot.data().districtId;
          } else {
            throw new Error(`Could not find a school with ID ${orgData.schoolId} in the ROAR database.`);
          }
        });
        orgData = {
          ...orgData,
          districtId,
        };
      }

      if (isTestData) orgData.testData = true;
      if (isDemoData) orgData.demoData = true;

      if (organizationId === undefined) {
        // If organizationId is undefined, we create a new org
        const newOrgRef = doc(collection(this.admin!.db, orgsCollection));
        const orgId = newOrgRef.id;
        transaction.set(newOrgRef, orgData);

        if (orgsCollection === 'schools') {
          const districtId = orgData.districtId as string;
          const adminDistrictRef = doc(this.admin!.db, 'districts', districtId);
          transaction.update(adminDistrictRef, { schools: arrayUnion(orgId) });
        } else if (orgsCollection === 'classes') {
          const schoolId = orgData.schoolId as string;
          const adminSchoolRef = doc(this.admin!.db, 'schools', schoolId);
          transaction.update(adminSchoolRef, { classes: arrayUnion(orgId) });
        }

        return orgId;
      } else {
        // If organizationId is defined, we update an existing org
        const orgDocRef = doc(this.admin!.db, orgsCollection, organizationId);

        // Get the old parent org IDs, remove this org from their children
        // fields on Firestore.
        const docSnap = await transaction.get(orgDocRef);
        if (docSnap.exists()) {
          const orgData = docSnap.data();
          const { schoolId, districtId } = orgData;
          if (schoolId !== undefined && schoolId !== orgData.schoolId) {
            const oldSchoolRef = doc(this.admin!.db, 'schools', schoolId);
            const newSchoolRef = doc(this.admin!.db, 'schools', orgData.schoolId);
            transaction.update(oldSchoolRef, { classes: arrayRemove(organizationId) });
            transaction.update(newSchoolRef, { classes: arrayUnion(organizationId) });
          } else if (districtId !== undefined && districtId !== orgData.districtId) {
            const oldDistrictRef = doc(this.admin!.db, 'districts', districtId);
            const newDistrictRef = doc(this.admin!.db, 'districts', orgData.districtId);
            transaction.update(oldDistrictRef, { schools: arrayRemove(organizationId) });
            transaction.update(newDistrictRef, { schools: arrayUnion(organizationId) });
          }

          transaction.update(orgDocRef, orgData as DocumentData);

          return organizationId;
        } else {
          throw new Error(`Could not find an organization with ID ${organizationId} in the ROAR database.`);
        }
      }
    });
  }

  /**
   * Delete an organization.
   *
   * @param recursive
   * @param orgsCollection The type of organization to create or update.
   * @param orgId The ID of the organization to delete.
   * @param recursive if true, recursively delete all children of this org.
   *                  Default is true.
   */
  async deleteOrg(orgsCollection: OrgCollectionName, orgId: string, recursive = true) {
    this._verifyAuthentication();
    this._verifyAdmin();

    if (!this._superAdmin) {
      throw new Error('You must be a super admin to delete an organization.');
    }

    // Loop over the admin and assessment databases
    runTransaction(this.admin!.db, async (transaction) => {
      const orgDocRef = doc(this.admin!.db, orgsCollection, orgId);
      const docSnap = await transaction.get(orgDocRef);
      if (docSnap.exists()) {
        const orgData = docSnap.data();

        // Save the dependent schools and classes for recursive deletion
        // later. Why are we doing this here? Because all transaction reads
        // have to take place before any writes, updates, or deletions.  We
        // are potentially reading school docs to get all of the classes.
        const { schools = [], classes = [], groups: subGroups = [] } = orgData;
        if (recursive) {
          for (const school of schools) {
            const schoolRef = doc(this.admin!.db, 'schools', school);
            const schoolDocSnap = await transaction.get(schoolRef);
            if (schoolDocSnap.exists()) {
              const schoolData = schoolDocSnap.data();
              classes.push(...(schoolData.classes ?? []));
              subGroups.push(...(schoolData.subGroups ?? []));
            }
          }
        }

        // Remove this org from the parent's list of child orgs.
        const { schoolId, districtId } = orgData;
        if (schoolId !== undefined) {
          const schoolRef = doc(this.admin!.db, 'schools', schoolId);
          transaction.update(schoolRef, { classes: arrayRemove(orgId) });
        } else if (districtId !== undefined) {
          const districtRef = doc(this.admin!.db, 'districts', districtId);
          transaction.update(districtRef, { schools: arrayRemove(orgId) });
        }

        transaction.delete(orgDocRef);

        // Remove children orgs if recursive is true
        if (recursive) {
          for (const _class of classes) {
            const classRef = doc(this.admin!.db, 'classes', _class);
            transaction.delete(classRef);
          }

          for (const school of schools) {
            const schoolRef = doc(this.admin!.db, 'schools', school);
            transaction.delete(schoolRef);
          }
        }
      } else {
        throw new Error(`Could not find an organization with ID ${orgId} in the ROAR database.`);
      }
    });
  }

  async registerTaskVariant({
    taskId,
    taskName,
    taskDescription,
    taskImage,
    taskURL,
    variantName,
    variantDescription,
    variantParams = {},
    testData = { task: false, variant: false },
    demoData = { task: false, variant: false },
  }: TaskVariantInfo) {
    this._verifyAuthentication();
    this._verifyAdmin();

    const task = new RoarTaskVariant({
      db: this.app!.db,
      taskId,
      taskName,
      taskDescription,
      taskImage,
      taskURL,
      variantName,
      variantDescription,
      variantParams,
      testData,
      demoData,
    });

    await task.toFirestore();

    return task;
  }

  // LEVANTE
  async createLevanteUsersWithEmailPassword(userData: LevanteUserData) {
    this._verifyAuthentication();
    this._verifyAdmin();

    const cloudCreateLevanteUsers = httpsCallable(this.admin!.functions, 'createLevanteUsers');
    return await cloudCreateLevanteUsers({ userData });
  }

  async saveSurveyResponses(surveyResponses: LevanteSurveyResponses) {
    this._verifyAuthentication();

    const cloudSaveSurveyResponses = httpsCallable(this.admin!.functions, 'saveSurveyResponses');
    return await cloudSaveSurveyResponses({ surveyResponses });
  }

  async createLevanteGroup(groupData: RoarOrg) {
    this._verifyAuthentication();
    this._verifyAdmin();

    const cloudCreateLevanteGroup = httpsCallable(this.admin!.functions, 'createLevanteGroup');
    return await cloudCreateLevanteGroup({ groupData });
  }
}
