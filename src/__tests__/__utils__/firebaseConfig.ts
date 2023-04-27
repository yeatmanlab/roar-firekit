import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc } from 'firebase/firestore';

import { EmulatorConfigData } from '../../firestore/util';

import * as assessmentFirebaseConfig from '../../../firebase/assessment/firebase.json';
import * as adminFirebaseConfig from '../../../firebase/admin/firebase.json';

const appConfig: EmulatorConfigData = {
  projectId: 'demo-gse-yeatmanlab',
  apiKey: 'any-string-value',
  emulatorPorts: {
    db: assessmentFirebaseConfig.emulators.firestore.port,
    auth: assessmentFirebaseConfig.emulators.auth.port,
  },
};

const adminConfig: EmulatorConfigData = {
  projectId: 'demo-gse-roar-admin',
  apiKey: 'any-string-value',
  emulatorPorts: {
    db: adminFirebaseConfig.emulators.firestore.port,
    auth: adminFirebaseConfig.emulators.auth.port,
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
export const rootDoc = doc(collection(db, 'ci'), 'test-root-doc');
