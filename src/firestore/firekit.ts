/* eslint-disable @typescript-eslint/no-non-null-assertion */
import _filter from 'lodash/filter';
import _fromPairs from 'lodash/fromPairs';
import _get from 'lodash/get';
import _set from 'lodash/set';
import _includes from 'lodash/includes';
import _isEmpty from 'lodash/isEmpty';
import _keys from 'lodash/keys';
import _map from 'lodash/map';
import _nth from 'lodash/nth';
import _union from 'lodash/union';
import dot from 'dot-object';
import { StatusCode } from 'status-code-enum';
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
  or,
  setDoc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { isEmailAvailable, isUsernameAvailable, roarEmail } from '../auth';
import { emptyOrg, emptyOrgList, initializeProjectFirekit, removeNull } from './util';
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
} from './interfaces';
import { IUserInput } from './app/user';
import { RoarAppkit } from './app/appkit';

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
  age_month: string | null,
  age_year: string | null,
  dob: string | null,
  grade: string,
  ell_status?: boolean,
  iep_status?: boolean,
  frl_status?: boolean,
  gender?: string,
  name?: {
    first?: string,
    middle?: string,
    last?: string
  },
  school: string | null,
  district: string | null,
  class: string | null,
  family: string | null,
  study: string | null,
}
interface ICurrentAssignments {
  assigned: string[];
  started: string[];
  completed: string[];
}

export class RoarFirekit {
  roarConfig: IRoarConfigData;
  app: IFirekit;
  admin: IFirekit;
  userData?: IUserData;
  roarAppUserInfo?: IUserInput;
  adminClaims?: Record<string, string[]>;
  currentAssignments?: ICurrentAssignments;
  private _authProvider?: AuthProviderType;
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

    onAuthStateChanged(this.admin.auth, (user) => {
      if (user) {
        this._listenToClaims(this.admin);
      }
    });

    onAuthStateChanged(this.app.auth, (user) => {
      if (user) {
        this._listenToClaims(this.app);
      }
    });

    this._listenToTokenChange(this.admin);
  }

  //           +--------------------------------+
  // ----------|  Begin Authentication Methods  |----------
  //           +--------------------------------+

  private _verify_authentication() {
    if (this.admin.user === undefined || this.app.user === undefined) {
      throw new Error('User is not authenticated.');
    }
  }

  private _verify_admin() {
    if (this.adminClaims === undefined) {
      throw new Error('User is not an administrator.');
    } else if (_isEmpty(_union(...Object.values(this.adminClaims)))) {
      throw new Error('User is not an administrator.');
    }
  }

  private _listenToClaims = (firekit: IFirekit) => {
    this._verify_authentication();
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
  };

  private _listenToTokenChange = (firekit: IFirekit) => {
    onIdTokenChanged(firekit.auth, async (user) => {
      const idTokenResult = await user!.getIdTokenResult(false);
      this.adminClaims = idTokenResult.claims.adminOrgs;
    });
  };

  private async _setUidCustomClaims() {
    this._verify_authentication();
    const setAdminUidClaims = httpsCallable(this.admin.functions, 'setuidclaims');
    const adminResult = await setAdminUidClaims({ assessmentUid: this.app.user!.uid });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (_get(adminResult.data as any, 'status', StatusCode.ServerErrorInternal) !== StatusCode.SuccessOK) {
      throw new Error('Failed to associate admin and assessment UIDs.');
    }

    const setAppUidClaims = httpsCallable(this.app.functions, 'setuidclaims');
    const appResult = await setAppUidClaims({ adminUid: this.admin.user!.uid, roarUid: this.roarUid! });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (_get(appResult.data as any, 'status', StatusCode.ServerErrorInternal) !== StatusCode.SuccessOK) {
      throw new Error('Failed to associate admin and assessment UIDs.');
    }
  }

  // TODO: Write a getAssessment function
  // Tasks should have: ID, name, dashboardDescription, imgUrl, version

  private async _syncCleverData() {
    if (this._authProvider === AuthProviderType.CLEVER) {
      this._verify_authentication();
      const syncAdminCleverData = httpsCallable(this.admin.functions, 'synccleverdata');
      const adminResult = await syncAdminCleverData({
        assessmentUid: this.app.user!.uid,
        accessToken: this.oAuthAccessToken,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (_get(adminResult.data as any, 'status', StatusCode.ServerErrorInternal) !== StatusCode.SuccessOK) {
        throw new Error('Failed to sync Clever and ROAR data.');
      }

      const syncAppCleverData = httpsCallable(this.app.functions, 'synccleverdata');
      const appResult = await syncAppCleverData({
        adminUid: this.admin.user!.uid,
        roarUid: this.roarUid,
        accessToken: this.oAuthAccessToken,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (_get(appResult.data as any, 'status', StatusCode.ServerErrorInternal) !== StatusCode.SuccessOK) {
        throw new Error('Failed to sync Clever and ROAR data.');
      }
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
            this._authProvider = AuthProviderType.EMAIL;
          })
          .then(this._setUidCustomClaims.bind(this))
          .then(this.getMyData.bind(this));
      });
  }

  async logInWithEmailAndPassword({
    email,
    password,
    fromUsername = false,
  }: {
    email: string;
    password: string;
    fromUsername?: boolean;
  }) {
    return signInWithEmailAndPassword(this.admin.auth, email, password).then((adminUserCredential) => {
      this.admin.user = adminUserCredential.user;
      return signInWithEmailAndPassword(this.app.auth, email, password)
        .then((appUserCredential) => {
          this.app.user = appUserCredential.user;
          if (fromUsername) {
            this._authProvider = AuthProviderType.USERNAME;
          } else {
            this._authProvider = AuthProviderType.EMAIL;
          }
        })
        .then(this._setUidCustomClaims.bind(this))
        .then(this.getMyData.bind(this));
    });
  }

  async logInWithUsernameAndPassword({ username, password }: { username: string; password: string }) {
    const email = roarEmail(username);
    return this.logInWithEmailAndPassword({ email, password, fromUsername: true });
  }

  async signInWithPopup(provider: AuthProviderType) {
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

    return signInWithPopup(this.admin.auth, authProvider)
      .then((adminResult) => {
        this.admin.user = adminResult.user;
        if (provider === AuthProviderType.GOOGLE) {
          const credential = GoogleAuthProvider.credentialFromResult(adminResult);
          // This gives you a Google Access Token. You can use it to access Google APIs.
          this._authProvider = provider;
          this.oAuthAccessToken = credential?.accessToken;
          return credential;
        } else if (provider === AuthProviderType.CLEVER) {
          const credential = OAuthProvider.credentialFromResult(adminResult);
          // This gives you a Clever Access Token. You can use it to access Clever APIs.
          this._authProvider = provider;
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
      .then(this._setUidCustomClaims.bind(this))
      .then(this._syncCleverData.bind(this))
      .then(this.getMyData.bind(this));
  }

  async initiateRedirect(provider: AuthProviderType) {
    const allowedProviders = [AuthProviderType.GOOGLE, AuthProviderType.CLEVER];

    let authProvider;
    if (provider === AuthProviderType.GOOGLE) {
      authProvider = new GoogleAuthProvider();
    } else if (provider === AuthProviderType.CLEVER) {
      authProvider = new OAuthProvider(RoarProviderId.CLEVER);
    } else {
      throw new Error(`provider must be one of ${allowedProviders.join(', ')}. Received ${provider} instead.`);
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
            this._authProvider = AuthProviderType.GOOGLE;
            this.oAuthAccessToken = credential?.accessToken;
            return credential;
          } else if (providerId === RoarProviderId.CLEVER) {
            const credential = OAuthProvider.credentialFromResult(adminRedirectResult);
            // This gives you a Clever Access Token. You can use it to access Clever APIs.
            this._authProvider = AuthProviderType.CLEVER;
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
      .then(this._setUidCustomClaims.bind(this))
      .then(this._syncCleverData.bind(this))
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

  //           +--------------------------------+
  // ----------|   End Authentication Methods   |----------
  //           +--------------------------------+

  //           +--------------------------------+
  // ----------| Begin Methods to Read User and |----------
  // ----------| Assignment/Administration Data |----------
  //           +--------------------------------+

  public get dbRefs() {
    if (this.admin.user && this.app.user) {
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
    this._verify_authentication();
    const userDocRef = doc(this.admin.db, 'users', uid);
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
    this._verify_authentication();
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
      // First, determine the PID based on the sign-in type
      const emailPidProviderTypes = [AuthProviderType.GOOGLE, AuthProviderType.EMAIL, AuthProviderType.USERNAME];
      let assessmentPid: string | undefined;
      if (this._authProvider === AuthProviderType.CLEVER) {
        // If using Clever OAuth, set PID to the clever id
        assessmentPid = this.userData.externalData?.clever?.id as string | undefined;
      } else if (_includes(emailPidProviderTypes, this._authProvider)) {
        // If using Google OAuth or email/username, set PID to the local-part of
        // the email (the part before the @)
        assessmentPid = _nth(this.app.user!.email?.match(/^(.+)@/), 1);
      }

      this.roarAppUserInfo = {
        db: this.app.db,
        roarUid: this.roarUid,
        assessmentUid: this.app.user!.uid,
        assessmentPid: assessmentPid,
        userType: this.userData.userType,
      };
    }
  }

  /* Return a list of all UIDs for users that this user has access to */
  async listUsers() {
    this._verify_authentication();

    throw new Error('Method not currently implemented.');

    const userCollectionRef = collection(this.admin.db, 'users');
    const userQuery = query(
      userCollectionRef,
      or(
        where('districts', 'array-contains', this.roarUid!),
        where('schools', 'array-contains', this.roarUid!),
        where('classes', 'array-contains', this.roarUid!),
        where('studies', 'array-contains', this.roarUid!),
        where('families', 'array-contains', this.roarUid!),
      ),
    );
    // TODO: Query all users within this user's admin orgs
    // TODO: Append the current user's uid to the list of UIDs
    return null;
  }

  /* Return a list of Promises for user objects for each of the UIDs given in the input array */
  getUsers(uidArray: string[]): Promise<IUserData | undefined>[] {
    this._verify_authentication();
    return uidArray.map((uid) => this._getUser(uid));
  }

  public get roarUid() {
    return this.admin.user?.uid;
  }

  private async _getAdministration(administrationId: string): Promise<IAdministrationData | undefined> {
    this._verify_authentication();
    const docRef = doc(this.admin.db, 'administrations', administrationId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as IAdministrationData;
    }
  }

  getAdministrations(administrationIds: string[]): Promise<IAdministrationData | undefined>[] {
    this._verify_authentication();
    return administrationIds.map((id) => this._getAdministration(id));
  }

  private async _getAssignment(administrationId: string): Promise<IAssignmentData | undefined> {
    this._verify_authentication();
    const docRef = doc(this.dbRefs!.admin.assignments, administrationId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as IAssignmentData;
    }
  }

  getAssignments(administrationIds: string[]): Promise<IAssignmentData | undefined>[] {
    this._verify_authentication();
    return administrationIds.map((id) => this._getAssignment(id));
  }

  async startAssignment(administrationId: string) {
    this._verify_authentication();
    const assignmentDocRef = doc(this.dbRefs!.admin.assignments, administrationId);
    const userDocRef = this.dbRefs!.admin.user;
    return updateDoc(assignmentDocRef, { started: true }).then(() =>
      updateDoc(userDocRef, { [`assignmentsStarted.${administrationId}`]: new Date() }),
    );
  }

  async completeAssignment(administrationId: string) {
    this._verify_authentication();
    const assignmentDocRef = doc(this.dbRefs!.admin.assignments, administrationId);
    const userDocRef = this.dbRefs!.admin.user;
    return updateDoc(assignmentDocRef, { completed: true }).then(() =>
      updateDoc(userDocRef, { [`assignmentsCompleted.${administrationId}`]: new Date() }),
    );
  }

  private async _updateAssessment(administrationId: string, taskId: string, updates: { [x: string]: unknown }) {
    this._verify_authentication();
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
    this._verify_authentication();

    // First grab data about the administration
    const administrationDocRef = doc(this.admin.db, 'administrations', administrationId);
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
        }).then(() => {
          if (this.roarAppUserInfo === undefined) {
            this.getMyData();
          }

          const assigningOrgs = assignmentDocSnap.data().assigningOrgs;

          // TODO: Fill in the rest of the task info
          const taskInfo = {
            db: this.app.db,
            taskId,
            taskName,
            taskDescription,
            variantName,
            variantDescription,
            variantParams: assessmentParams,
          };

          return new RoarAppkit({
            auth: this.app.auth,
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
    this._verify_authentication();
    return this._updateAssessment(administrationId, taskId, { rewardShown: true });
  }

  // These are all methods that will be important for admins, but not necessary for students
  async createAdministration(assessments: IAssessmentData[], dateOpen: Date, dateClose: Date, sequential = true) {
    this._verify_authentication();

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
    const administrationDocRef = await addDoc(collection(this.admin.db, 'administrations'), administrationData);

    // Then add the ID to the admin's list of administrationsCreated
    const userDocRef = this.dbRefs!.admin.user;
    await updateDoc(userDocRef, {
      'adminData.administrationsCreated': arrayUnion(administrationDocRef.id),
    });
  }

  async assignAdministrationToOrgs(administrationId: string, orgs: IOrgLists = emptyOrgList()) {
    this._verify_authentication();
    this._verify_admin();
    const docRef = doc(this.admin.db, 'administrations', administrationId);

    await updateDoc(docRef, {
      districts: arrayUnion(orgs.districts),
      schools: arrayUnion(orgs.schools),
      classes: arrayUnion(orgs.classes),
      studies: arrayUnion(orgs.studies),
      families: arrayUnion(orgs.families),
    });
  }

  async unassignAdministrationToUsers(administrationId: string, orgs: IOrgLists = emptyOrgList()) {
    this._verify_authentication();
    this._verify_admin();

    const docRef = doc(this.admin.db, 'administrations', administrationId);

    await updateDoc(docRef, {
      districts: arrayRemove(orgs.districts),
      schools: arrayRemove(orgs.schools),
      classes: arrayRemove(orgs.classes),
      studies: arrayRemove(orgs.studies),
      families: arrayRemove(orgs.families),
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

  async createStudentWithEmailPassword(email: string, password: string, userData: ICreateUserInput) {
    this._verify_authentication();

    const isEmailAvailable = await this.isEmailAvailable(email)
    if(isEmailAvailable){
      let userObject: any = {
        userType: "student",
        studentData: {}
      }
      if(!_get(userData, 'age') && !_get(userData, 'dob')) {
        throw new Error('Either age or date of birth must be supplied.')
      }

      if(_get(userData, 'name')) _set(userObject, 'name', userData.name);
      if(_get(userData, 'age_year')){
        const age: number = Number(userData.age_year);
        const yearOffset = Math.floor(age);
        const monthOffset = (age % yearOffset) * 10;
        let calcDob = new Date();
        calcDob.setFullYear(calcDob.getFullYear() - yearOffset);
        calcDob.setMonth(calcDob.getMonth() - monthOffset);
        _set(userObject, 'studentData.dob', calcDob);
      }
      if(_get(userData, 'age_month')){
        const age: number = Number(userData.age_year);
        const monthOffset = Math.floor(age);
        let calcDob = new Date();
        calcDob.setMonth(calcDob.getMonth() - monthOffset);
        _set(userObject, 'studentData.dob', calcDob);
      }
      if(_get(userData, 'dob')) _set(userObject, 'studentData.dob', userData.dob);
      if(_get(userData, 'gender')) _set(userObject, 'studentData.gender', userData.gender);
      if(_get(userData, 'ell_status')) _set(userObject, 'studentData.ell_status', userData.ell_status);
      if(_get(userData, 'iep_status')) _set(userObject, 'studentData.iep_status', userData.iep_status)
      if(_get(userData, 'frl_status')) _set(userObject, 'studentData.frl_status', userData.frl_status);

      const dateNow = Date.now()
      // create district entry
      const districtId = _get(userData, 'district');
      if(districtId) {
        _set(userObject, 'districts', {
          current: [districtId],
          all: [districtId],
          dates: {
            [districtId!]: {
              from: dateNow,
              to: null
            }
          }
        })
      }
      // create school entry
      const schoolId = _get(userData, 'school');
      if(schoolId){
        _set(userObject, 'schools', {
          current: [schoolId],
          all: [schoolId],
          dates: {
            [schoolId!]: {
              from: dateNow,
              to: null
            }
          }
        })
      }
      // create class entry
      const classId = _get(userData, 'class');
      if(classId){
        _set(userObject, 'classes', {
          current: [classId],
          all: [classId],
          dates: {
            [classId!]: {
              from: dateNow,
              to: null
            }
          }
        })
      }
      const cloudCreateAdminStudent = httpsCallable(this.admin.functions, 'createstudent');
      const adminResponse = await cloudCreateAdminStudent({email, password, userData});
      const adminUid = _get(adminResponse, 'data.adminUid');

      const cloudCreateAppStudent = httpsCallable(this.app.functions, 'createstudent');
      const appResponse = await cloudCreateAppStudent({adminUid, email, password, userData});
      const assessmentUid = _get(appResponse, 'data.assessmentUid');
      // Note: The assessment createstudent cloud function handles setting up the user claim.
    } else {
      // Email is not available, reject
      throw new Error(`The email ${email} is not available.`);
    }
  }

  async createStudentWithUsernamePassword(username: string, password: string, userData: ICreateUserInput){
    const isUsernameAvailable = await this.isUsernameAvailable(username);
    if(isUsernameAvailable) {
      const email = `${username}@roar-auth.com`;
      await this.createStudentWithEmailPassword(email, password, userData)
    } else {
      // Username is not available, reject
      throw new Error(`The username ${username} is not available.`);
    }
  }

  // async updateUser();

  // TODO: Adam write the appFirekit
  // createAppFirekit(taskInfo: ITaskVariantInput);
  //   // TODO: Elijah, finish this function or something like it.
  //   async createUserWithUsernameAndPassword(
  //     roarUid: string,
  //     userData: IUserData,
  //     externalResourceId?: string,
  //     externalData?: { [x: string]: unknown },
  //     username: string,
  //     password: string,
  //   ) {
  //     throw new Error('Not yet implemented');
  //     this._verify_authentication();

  //     const userDocRef = doc(this.admin.db, 'users', roarUid);
  //     await setDoc(userDocRef, userData);

  //     if (externalResourceId !== undefined && externalData !== undefined) {
  //       await this.updateUserExternalData(userDocRef.id, externalResourceId, externalData);
  //     }

  //     // Add the new user to this admin's list of users in the assessment database ACL.
  //     const aclDocRef = doc(this.app.db, 'accessControl', this.app.user!.uid);
  //     await setDoc(
  //       aclDocRef,
  //       {
  //         [roarUid]: true,
  //       },
  //       { merge: true },
  //     );

  //     // TODO Adam: Add the user to the assessment database as well.
  //   }
}
