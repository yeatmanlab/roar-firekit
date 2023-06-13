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
  setDoc,
  updateDoc,
  query,
  or,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { isEmailAvailable, isUsernameAvailable } from '../auth';
import { initializeProjectFirekit, removeNull } from './util';
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
} from './interfaces';
import { RoarAppUser } from './app/user';
import { RoarRun } from './app/run';

enum OAuthProviderType {
  CLEVER = 'clever',
  GOOGLE = 'google',
}

const RoarProviderId = {
  ...ProviderId,
  CLEVER: 'oidc.clever',
};

interface ICreateUserInput {
  age: string | null,
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

export class RoarFirekit {
  roarConfig: IRoarConfigData;
  app: IFirekit;
  admin: IFirekit;
  userData?: IUserData;
  roarAppUser?: RoarAppUser;
  adminClaims?: Record<string, string[]>;
  private _oAuthProvider?: OAuthProviderType;
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

  // TODO: Add dateAssigned, dateOpened, dateClosed to each user's assignment.
  // Tasks should have: ID, name, dashboardDescription, imgUrl, version
  private async _syncCleverData() {
    if (this._oAuthProvider === OAuthProviderType.CLEVER) {
      this._verify_authentication();
      const syncAdminCleverData = httpsCallable(this.admin.functions, 'synccleverdata');
      const adminResult = await syncAdminCleverData({ assessmentUid: this.app.user!.uid, accessToken: this.oAuthAccessToken });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (_get(adminResult.data as any, 'status', StatusCode.ServerErrorInternal) !== StatusCode.SuccessOK) {
        throw new Error('Failed to sync Clever and ROAR data.');
      }

      const syncAppCleverData = httpsCallable(this.app.functions, 'synccleverdata');
      const appResult = await syncAppCleverData({ adminUid: this.admin.user!.uid, roarUid: this.roarUid, accessToken: this.oAuthAccessToken });

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
          })
          .then(this._setUidCustomClaims.bind(this))
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
        .then(this._setUidCustomClaims.bind(this))
        .then(this.getMyData.bind(this));
    });
  }

  async signInWithPopup(provider: OAuthProviderType) {
    let authProvider;
    if (provider === OAuthProviderType.GOOGLE) {
      authProvider = new GoogleAuthProvider();
    } else if (provider === OAuthProviderType.CLEVER) {
      authProvider = new OAuthProvider(RoarProviderId.CLEVER);
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
          this._oAuthProvider = provider;
          this.oAuthAccessToken = credential?.accessToken;
          return credential;
        } else if (provider === OAuthProviderType.CLEVER) {
          const credential = OAuthProvider.credentialFromResult(adminResult);
          // This gives you a Clever Access Token. You can use it to access Clever APIs.
          this._oAuthProvider = provider;
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
            this._oAuthProvider = OAuthProviderType.GOOGLE;
            this.oAuthAccessToken = credential?.accessToken;
            return credential;
          } else if (providerId === RoarProviderId.CLEVER) {
            const credential = OAuthProvider.credentialFromResult(adminRedirectResult);
            // This gives you a Clever Access Token. You can use it to access Clever APIs.
            this._oAuthProvider = OAuthProviderType.CLEVER;
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
    }
  }

  async getMyData() {
    this._verify_authentication();
    this.userData = await this._getUser(this.roarUid!);
    if (this.userData) {
      this.roarAppUser = new RoarAppUser({
        db: this.app.db,
        assessmentUid: this.app.user!.uid,
        roarUid: this.roarUid!,
        // TODO: How do we figure out the pid
        assessmentPid: this.app.user!.pid,
        birthMonth: this.userData.dob?.getMonth(),
        birthYear: this.userData.dob?.getFullYear(),
        classIds: this.userData.classIds,
        classes: this.userData.classes,
        schoolId: this.userData.schoolId,
        schools: this.userData.schools,
        districtId: this.userData.districtId,
        districts: this.userData.districts,
        studies: this.userData.studies,
        families: this.userData.families,
        userType: this.userData.userType,
      });
    }
  }

  /* Return a list of all UIDs for users that this user has access to */
  async listUsers() {
    this._verify_authentication();

    const userCollectionRef = collection(this.admin.db, 'users');
    const userQuery = query(userCollectionRef,
      or(
        where('districts', 'array-contains', this.roarUid!),
        where('schools', 'array-contains', this.roarUid!),
        where('classes', 'array-contains', this.roarUid!),
        where('studies', 'array-contains', this.roarUid!),
        where('families', 'array-contains', this.roarUid!),
      ));
    // TODO: Query all users within this user's admin orgs
    // TODO: Append the current user's uid to the list of UIDs
    return null;
  }

  /* Return a list of Promises for user objects for each of the UIDs given in the input array */
  getUsers(uidArray: string[]): Promise<IUserData | undefined>[] {
    this._verify_authentication();
    return uidArray.map((uid) => this._getUser(uid));
  }

  public get assignmentsAssigned() {
    return this.userData?.assignmentsAssigned;
  }

  public get assignmentsStarted() {
    return this.userData?.assignmentsStarted;
  }

  public get assignmentsCompleted() {
    return this.userData?.assignmentsCompleted;
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

  getMyAssignments(administrationIds: string[]): Promise<IAssignmentData | undefined>[] {
    this._verify_authentication();
    return administrationIds.map((id) => this._getAssignment(id));
  }

  async appendAssignmentToStartedList(administrationId: string) {
    this._verify_authentication();
    const userDocRef = this.dbRefs!.admin.user;
    return updateDoc(userDocRef, { [`assignmentsStarted.${administrationId}`]: new Date() });
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
          this.appendAssignmentToStartedList(administrationId);
        }
        allRunIdsForThisTask.push(runId);

        // Overwrite `runId` and append runId to `allRunIds` for this assessment
        // in the userId/assignments collection
        return this._updateAssessment(administrationId, taskId, {
          startedOn: new Date(),
          runId: runId,
          allRunIds: allRunIdsForThisTask,
        }).then(() => {
          if (this.roarAppUser === undefined) {
            this.getMyData();
          }

          return new RoarRun({
            user: this.roarAppUser!,
            task:
            studyId:
            runId
          })
        });
      } else {
        throw new Error(`Could not find assignment for user ${this.roarUid} with administration id ${administrationId}`);
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

  // TODO: Assign the administration to orgs rather than individual users
  // TODO: Write a cloud function that will modify each assigned user's local administrations
  async assignAdministrationToUsers(administrationId: string, userIds: string[]) {
    this._verify_authentication();
    const users = await Promise.all(this.getUsers(userIds));
    const studentData = _without(
      users.map((user: IUserData | undefined) => user?.studentData),
      undefined,
    );

    const studies = _uniq(studentData.map((user) => user!.studies));
    const families = _uniq(studentData.map((user) => user!.families));
    const classes = _uniq(studentData.map((user) => user!.classId));
    const schools = _uniq(studentData.map((user) => user!.schoolId));
    const districts = _uniq(studentData.map((user) => user!.districtId));
    const grades = _uniq(studentData.map((user) => user!.grade));

    const docRef = doc(this.admin.db, 'administrations', administrationId);
    await updateDoc(docRef, {
      users: arrayUnion(userIds),
      classes: arrayUnion(classes),
      schools: arrayUnion(schools),
      districts: arrayUnion(districts),
      grades: arrayUnion(grades),
      studies: arrayUnion(studies),
      families: arrayUnion(families),
    });
  }

  // TODO: Review this in light of the RBAC changes
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

  // TODO: Review this in light of the RBAC changes
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
    email: string,
    password: string,
    userData: ICreateUserInput,
  ) {
    this._verify_authentication();

    const isEmailAvailable = await this.isUsernameAvailable(email)
    if(isEmailAvailable){
      let userObject: any = {
        userType: "student",
        studentData: {}
      }
      if(!_get(userData, 'age') && !_get(userData, 'dob')) {
        // Throw exception or return code
        // User can NOT lack date of birth AND age
        return 1;
      }
      if(_get(userData, 'name')) userObject['name'] = userData.name;
      if(_get(userData, 'dob')) userObject['studentData']['dob'] = userData.dob;
      if(_get(userData, 'age')){
        const age: number = Number(userData.age);
        const yearOffset = Math.floor(age);
        const monthOffset = age % yearOffset;
        let calcDob = new Date();
        calcDob.setFullYear(calcDob.getFullYear() - yearOffset);
        calcDob.setMonth(calcDob.getMonth() - monthOffset)
        userObject['studentData']['dob'] = calcDob;
      }
      if(_get(userData, 'gender')) userObject['studentData']['gender'] = userData.gender;
      if(_get(userData, 'ell_status')) userObject['studentData']['ell_status'] = userData.ell_status;
      if(_get(userData, 'iep_status')) userObject['studentData']['iep_status'] = userData.iep_status;
      if(_get(userData, 'frl_status')) userObject['studentData']['frl_status'] = userData.frl_status;

      const dateNow = Date.now()
      // create district entry
      const districtId = _get(userData, 'district');
      if(districtId) {
        userObject['districts'] = {
          current: [districtId],
          all: [districtId],
          dates: {
            [districtId!]: {
              from: dateNow,
              to: null
            }
          }
        }
      }
      // create school entry
      const schoolId = _get(userData, 'school');
      if(schoolId){
        userObject['schools'] = {
          current: [schoolId],
          all: [schoolId],
          dates: {
            [schoolId!]: {
              from: dateNow,
              to: null
            }
          }
        }
      }
      // create class entry
      const classId = _get(userData, 'class');
      if(classId){
        userObject['classes'] = {
          current: [classId],
          all: [classId],
          dates: {
            [classId!]: {
              from: dateNow,
              to: null
            }
          }
        }
      }
      const cloudCreateUser = httpsCallable(this.admin.functions, 'createUser');
      const adminId = await cloudCreateUser({email, password, userData});
      // call assessment cloud function with adminId
      // use returned assessmesnt id and write to admin firestore
    } else {
      // Throw exception or return status
      return 1;
    }
  }

  // async updateUser();

  // TODO: Adam write the appFirekit
  // createAppFirekit(taskInfo: ITaskVariantInput);
}
