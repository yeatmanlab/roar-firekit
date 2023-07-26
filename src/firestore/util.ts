import { initializeApp, getApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  setPersistence,
} from 'firebase/auth';
import { connectFirestoreEmulator, Firestore, getFirestore } from 'firebase/firestore';
import { Functions, connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import _get from 'lodash/get';
import _isEqual from 'lodash/isEqual';
import { markRaw } from 'vue';

/** Remove null attributes from an object
 * @function
 * @param {Object} obj - Object to remove null attributes from
 * @returns {Object} Object with null attributes removed
 */
export const removeNull = (obj: object): object => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== null));
};

/** Remove undefined attributes from an object
 * @function
 * @param {Object} obj - Object to remove undefined attributes from
 * @returns {Object} Object with undefined attributes removed
 */
export const removeUndefined = (obj: object): object => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
};

export interface CommonFirebaseConfig {
  projectId: string;
  apiKey: string;
}

export interface EmulatorConfigData extends CommonFirebaseConfig {
  emulatorPorts: {
    db: number;
    auth: number;
    functions: number;
  };
}

export interface RealConfigData extends CommonFirebaseConfig {
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export type FirebaseConfigData = RealConfigData | EmulatorConfigData;

export const safeInitializeApp = (config: RealConfigData, name: string) => {
  try {
    const app = getApp(name);
    if (!_isEqual(app.options, config)) {
      throw new Error(`There is an existing firebase app named ${name} with different configuration options.`);
    }
    return app;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.code === 'app/no-app') {
      return initializeApp(config, name);
    } else {
      throw error;
    }
  }
};

export enum AuthPersistence {
  local = 'local',
  session = 'session',
  none = 'none',
}

export interface MarkRawConfig {
  auth?: boolean;
  db?: boolean;
  functions?: boolean;
}

type FirebaseProduct = Auth | Firestore | Functions;

export const initializeFirebaseProject = async (
  config: FirebaseConfigData,
  name: string,
  authPersistence = AuthPersistence.session,
  markRawConfig: MarkRawConfig = {},
) => {
  const optionallyMarkRaw = <T extends FirebaseProduct>(productKey: string, productInstance: T): T => {
    if (_get(markRawConfig, productKey)) {
      return markRaw(productInstance);
    } else {
      return productInstance;
    }
  };

  if ((config as EmulatorConfigData).emulatorPorts) {
    const app = initializeApp({ projectId: config.projectId, apiKey: config.apiKey }, name);
    const ports = (config as EmulatorConfigData).emulatorPorts;
    const auth = optionallyMarkRaw('auth', getAuth(app));
    const db = optionallyMarkRaw('db', getFirestore(app));
    const functions = optionallyMarkRaw('functions', getFunctions(app));

    connectFirestoreEmulator(db, '127.0.0.1', ports.db);
    connectFunctionsEmulator(functions, '127.0.0.1', ports.functions);

    const originalInfo = console.info;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    console.info = () => {};
    connectAuthEmulator(auth, `http://127.0.0.1:${ports.auth}`);
    console.info = originalInfo;

    return {
      firebaseApp: app,
      auth,
      db,
      functions,
    };
  } else {
    const app = safeInitializeApp(config as RealConfigData, name);
    const kit = {
      firebaseApp: app,
      auth: optionallyMarkRaw('auth', getAuth(app)),
      db: optionallyMarkRaw('db', getFirestore(app)),
      functions: optionallyMarkRaw('functions', getFunctions(app)),
    };

    // Auth state persistence is set with ``setPersistence`` and specifies how a
    // user session is persisted on a device. We choose in session persistence by
    // default because many students will access the ROAR on shared devices in the
    // classroom.
    if (authPersistence === AuthPersistence.session) {
      await setPersistence(kit.auth, browserSessionPersistence);
    } else if (authPersistence === AuthPersistence.local) {
      await setPersistence(kit.auth, browserLocalPersistence);
    } else if (authPersistence === AuthPersistence.none) {
      await setPersistence(kit.auth, inMemoryPersistence);
    }

    return kit;
  }
};

/** Get unique entries from a single id string and an array of id strings
 *
 * @function
 * @param {string} id - a single id string
 * @param {string[]} idArray - an array of id strings
 * @returns {string[]} the merged array of unique ids
 */
export const mergeIds = (id: string | undefined, idArray: string[] | undefined) => {
  const resultIds: string[] = [];
  if (id) resultIds.push(id);
  if (idArray && idArray.length) resultIds.push(...idArray);

  return [...new Set(resultIds)];
};

export interface IUserDocument {
  districtId?: string;
  schoolId?: string;
  schools?: string[];
  classId?: string;
  classes?: string[];
  studyId?: string;
  studies?: string[];
}

export const getOrgs = (docData: IUserDocument) => {
  const { districtId, schoolId, schools, classId, classes, studyId, studies } = docData;
  const districtIds = mergeIds(districtId, undefined);
  const schoolIds = mergeIds(schoolId, schools);
  const classIds = mergeIds(classId, classes);
  const studyIds = mergeIds(studyId, studies);

  return {
    districtIds,
    schoolIds,
    classIds,
    studyIds,
  };
};

export const userHasSelectedOrgs = (usersOrgs: string[], selectedOrgs: string[]) => {
  // If the selected org list is empty, assume that the user wants all users
  if (selectedOrgs.length === 0) {
    return true;
  }
  return Boolean(usersOrgs.filter((value) => selectedOrgs.includes(value)).length);
};

export const emptyOrg = () => {
  return {
    current: [],
    all: [],
    dates: {},
  };
};

export const emptyOrgList = () => {
  return {
    districts: [],
    schools: [],
    classes: [],
    studies: [],
    families: [],
  };
};

export const waitFor = (conditionFunction: () => boolean) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poll = (resolve: any) => {
    if (conditionFunction()) resolve();
    else setTimeout(() => poll(resolve), 300);
  };

  return new Promise(poll);
};
