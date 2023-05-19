import { initializeApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, doc, getFirestore } from 'firebase/firestore';

import { EmulatorConfigData } from '../../firestore/util';

import * as assessmentFirebaseConfig from '../../../firebase/assessment/firebase.json';
import * as adminFirebaseConfig from '../../../firebase/admin/firebase.json';

const appConfig: EmulatorConfigData = {
  projectId: 'demo-gse-yeatmanlab',
  apiKey: 'any-string-value',
  emulatorPorts: {
    db: assessmentFirebaseConfig.emulators.firestore.port,
    auth: assessmentFirebaseConfig.emulators.auth.port,
    functions: assessmentFirebaseConfig.emulators.functions.port,
  },
};

const adminConfig: EmulatorConfigData = {
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

const db = getFirestore(firebaseApps.app);
connectFirestoreEmulator(db, '127.0.0.1', roarConfig.app.emulatorPorts.db);
export const rootDoc = doc(collection(db, 'ci'), 'test-root-doc');
