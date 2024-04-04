import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

import { EmulatorFirebaseConfig } from '../../firestore/util';

import * as assessmentFirebaseConfig from '../../../firebase/assessment/firebase.json';
import * as adminFirebaseConfig from '../../../firebase/admin/firebase.json';

const appConfig: EmulatorFirebaseConfig = {
  projectId: 'demo-gse-roar-assessment',
  apiKey: 'any-string-value',
  emulatorPorts: {
    db: assessmentFirebaseConfig.emulators.firestore.port,
    auth: assessmentFirebaseConfig.emulators.auth.port,
    functions: assessmentFirebaseConfig.emulators.functions.port,
  },
};

const adminConfig: EmulatorFirebaseConfig = {
  projectId: 'demo-gse-roar-admin',
  apiKey: 'any-string-value',
  emulatorPorts: {
    db: adminFirebaseConfig.emulators.firestore.port,
    auth: adminFirebaseConfig.emulators.auth.port,
    functions: adminFirebaseConfig.emulators.functions.port,
  },
};

export const roarConfig = {
  app: appConfig,
  admin: adminConfig,
};

export const firebaseApps = {
  app: initializeApp(roarConfig.app, 'test-app'),
  admin: initializeApp(roarConfig.admin, 'test-admin'),
};

export const db = getFirestore(firebaseApps.app);
connectFirestoreEmulator(db, '127.0.0.1', roarConfig.app.emulatorPorts.db);
