import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc } from 'firebase/firestore';

// The gse-yeatmanlab firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.ROAR_FIREBASE_API_KEY || '',
  authDomain: process.env.ROAR_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.ROAR_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.ROAR_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.ROAR_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.ROAR_FIREBASE_APP_ID || '',
  measurementId: process.env.ROAR_FIREBASE_MEASUREMENT_ID || '',
};

export const firebaseApp = initializeApp(firebaseConfig, 'unittest');
const db = getFirestore(firebaseApp);
export const rootDoc = doc(collection(db, 'ci'), 'test-root-doc');
