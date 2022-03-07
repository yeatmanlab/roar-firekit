import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  UserCredential,
} from 'firebase/auth';
import { v5 as uuidv5 } from 'uuid';

/**
 * Return a unique, reproducible, and disposable email address for the
 * user.
 *
 * We create an email/password combination for each roar UID. This
 * function uses dispostable.com to create a disposable email address for
 * authentication. On dispostable.com, unread emails are deleted after 2
 * days and read messages are deleted after 2 months. These messages are
 * viewable by anyone who knows the email address, so this email is not
 * intended to receive secure messages.
 *
 * @function
 * @param {string} roarUid - The ROAR user ID
 * @returns {string} - The email address
 */
export const roarEmail = (roarUid: string): string => {
  return `${roarUid}@dispotable.com`;
};

const roarUuidv5Namespace = uuidv5('https://reading.stanford.edu/', uuidv5.URL);

/**
 * Return a unique and reproducible password for the user.
 *
 * We create an email/password combination for each roar UID. This
 * computed property returns a UUID V5 hash of the roar UID using the ROAR
 * UUID namespace, which itself is a UUID V5 hash of the the
 * https://reading.stanford.edu/ URL using the UUID V5 URL namespace.
 *
 * @function
 * @param {string} roarUid - The ROAR user ID
 * @returns {string} - The password
 */
export const roarPassword = (roarUid: string): string => {
  return uuidv5(roarUid, roarUuidv5Namespace).replace(/-/g, '');
};

export const firebaseSignIn = async (roarUid: string) => {
  const auth = getAuth();

  console.log(`Creating user with email ${roarEmail(roarUid)}`);
  const userCredential: UserCredential = await createUserWithEmailAndPassword(
    auth,
    roarEmail(roarUid),
    roarPassword(roarUid),
  ).catch((error) => {
    if (error.code === 'auth/email-already-in-use') {
      console.log('Email already in use');
      return signInWithEmailAndPassword(auth, roarEmail(roarUid), roarPassword(roarUid));
    } else {
      throw error;
    }
  });
  console.log(`Signed in as ${userCredential.user.email}`);
  console.log(`Firebase UID: ${userCredential.user.uid}`);
  return auth;
};

export const firebaseSignOut = async () => {
  const auth = getAuth();
  await signOut(auth);
  return auth;
};
