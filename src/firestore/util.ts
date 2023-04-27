import { initializeApp, getApp } from 'firebase/app';
import { inMemoryPersistence, getAuth, setPersistence, connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator, enableIndexedDbPersistence, Firestore, getFirestore } from 'firebase/firestore';
import _isEqual from 'lodash/isEqual';

/** Remove null attributes from an object
 * @function
 * @param {Object} obj - Object to remove null attributes from
 * @returns {Object} Object with null attributes removed
 */
export const removeNull = (obj: object): object => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v != null));
};

export interface CommonFirebaseConfig {
  projectId: string;
  apiKey: string;
}

export interface EmulatorConfigData extends CommonFirebaseConfig {
  emulatorPorts: {
    db: number;
    auth: number;
  };
}

export interface RealConfigData extends CommonFirebaseConfig {
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

export type FirebaseConfigData = RealConfigData | EmulatorConfigData;

export const roarEnableIndexedDbPersistence = (db: Firestore) => {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
      console.log(
        "Couldn't enable indexed db persistence. This is probably because the browser has multiple roar tabs open.",
      );
      // Multiple tabs open, persistence can only be enabled
      // in one tab at a a time.
      // ...
    } else if (err.code == 'unimplemented') {
      console.log("Couldn't enable indexed db persistence. This is probably because the browser doesn't support it.");
      // The current browser does not support all of the
      // features required to enable persistence
      // ...
    }
  });
  // Subsequent queries will use persistence, if it was enabled successfully
};

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

export const initializeProjectFirekit = (config: FirebaseConfigData, name: string, enableDbPersistence = true) => {
  if ((config as EmulatorConfigData).emulatorPorts) {
    const app = initializeApp({ projectId: config.projectId, apiKey: config.apiKey }, name);
    const ports = (config as EmulatorConfigData).emulatorPorts;
    const auth = getAuth(app);
    const db = getFirestore(app);

    connectFirestoreEmulator(db, 'localhost', ports.db);

    const originalInfo = console.info;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    console.info = () => {};
    connectAuthEmulator(auth, `http://localhost:${ports.auth}`);
    console.info = originalInfo;

    return {
      firebaseApp: app,
      auth,
      db,
    };
  } else {
    const app = safeInitializeApp(config as RealConfigData, name);
    const kit = {
      firebaseApp: app,
      auth: getAuth(app),
      db: getFirestore(app),
    };

    // Auth state persistence is set with ``setPersistence`` and specifies how a
    // user session is persisted on a device. We choose in memory persistence by
    // default because many students will access the ROAR on shared devices in the
    // classroom.
    // setPersistence(kit.auth, inMemoryPersistence);

    if (enableDbPersistence) {
      // Firestore offline data persistence enables Cloud Firestore data caching
      // when the device is offline.
      roarEnableIndexedDbPersistence(kit.db);
    }

    return kit;
  }
};

/** Get unique entries from a single id string and an array of id strings
 *
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
