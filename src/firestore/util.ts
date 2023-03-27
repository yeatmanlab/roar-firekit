import { initializeApp, getApp } from 'firebase/app';
import { inMemoryPersistence, getAuth, setPersistence } from 'firebase/auth';
import { enableIndexedDbPersistence, Firestore, getFirestore } from 'firebase/firestore';
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

export interface FirebaseConfigData {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

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

export const safeInitializeApp = (config: FirebaseConfigData, name: string) => {
  try {
    const app = getApp(name);
    if (!_isEqual(app.options, config)) {
      throw new Error(`There is an existing firebase app named ${name} with different configuration options.`);
    }
    return app;
  } catch (error: any) {
    if (error.code === 'app/no-app') {
      return initializeApp(config, name);
    } else {
      throw error;
    }
  }
};

export const initializeProjectFirekit = (config: FirebaseConfigData, name: string) => {
  const app = safeInitializeApp(config, name);
  const kit = {
    firebaseApp: app,
    auth: getAuth(app),
    db: getFirestore(app),
  };

  // Auth state persistence is set with ``setPersistence`` and specifies how a
  // user session is persisted on a device. We choose in memory persistence by
  // default because many students will access the ROAR on shared devices in the
  // classroom.
  setPersistence(kit.auth, inMemoryPersistence);

  // Firestore offline data persistence enables Cloud Firestore data caching
  // when the device is offline.
  roarEnableIndexedDbPersistence(kit.db);

  return kit;
};
