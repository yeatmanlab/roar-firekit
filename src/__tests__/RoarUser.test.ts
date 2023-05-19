import { initializeApp } from 'firebase/app';
import {
  DocumentReference,
  Timestamp,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
} from 'firebase/firestore';
import { connectAuthEmulator, deleteUser, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { v4 as uuidv4 } from 'uuid';
import { RoarAppUser } from '../firestore/app/user';
import { roarConfig, rootDoc } from './__utils__/firebaseConfig';
import { email as ciEmail, password as ciPassword } from './__utils__/roarCIUser';
import { IFirekit, UserType } from '../firestore/interfaces';

const getRandomUserInput = async () => {
  const uid = `ci-user-${uuidv4()}`;
  const userInput = {
    id: uid,
    firebaseUid: '',
    birthMonth: 1,
    birthYear: 1983,
    classId: 'test-class-id',
    schoolId: 'test-school-id',
    districtId: 'test-district-id',
    studies: ['test-study-id1', 'test-study-id2'],
    userCategory: UserType.student,
  };

  return userInput;
};

describe('RoarAppUser', () => {
  let app: IFirekit;

  beforeAll(() => {
    const assessmentApp = initializeApp({ projectId: roarConfig.app.projectId, apiKey: roarConfig.app.apiKey }, 'app');

    app = {
      firebaseApp: assessmentApp,
      auth: getAuth(assessmentApp),
      db: getFirestore(assessmentApp),
    };

    const originalWarn = console.warn;
    const originalInfo = console.info;
    console.warn = jest.fn();
    console.info = jest.fn();

    connectAuthEmulator(app.auth, `http://127.0.0.1:${roarConfig.app.emulatorPorts.auth}`);
    connectFirestoreEmulator(app.db, '127.0.0.1', roarConfig.app.emulatorPorts.db);

    console.warn = originalWarn;
    console.info = originalInfo;
  });

  afterEach(async () => {
    await signOut(app.auth);
  });

  it('constructs a user', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarAppUser(userInput);
    expect(user.id).toBe(userInput.id);
    expect(user.firebaseUid).toBe(userInput.firebaseUid);
    expect(user.birthMonth).toBe(userInput.birthMonth);
    expect(user.birthYear).toBe(userInput.birthYear);
    expect(user.classId).toBe(userInput.classId);
    expect(user.schoolId).toBe(userInput.schoolId);
    expect(user.districtId).toBe(userInput.districtId);
    expect(user.studies).toBe(userInput.studies);
    expect(user.userCategory).toBe(userInput.userCategory);
    expect(user.isPushedToFirestore).toBe(false);
    expect(user.userRef).toBeUndefined();
  });

  it('validates userCategory input', async () => {
    const allowedUserCategories = Object.values(UserType);
    const errorMessage = `User category must be one of ${allowedUserCategories.join(', ')}.`;
    await expect(async () => {
      const userInput = await getRandomUserInput();
      const invalidInput = Object.create(userInput);
      invalidInput.userCategory = 'superhero';
      new RoarAppUser(invalidInput);
    }).rejects.toThrow(errorMessage);
  });

  it('sets Firestore document references', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarAppUser(userInput);
    user.setRefs(rootDoc);
    expect(user.userRef).toBeInstanceOf(DocumentReference);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(user.userRef!.id).toBe(doc(rootDoc, 'users', user.id).id);
  });

  it('throws if trying to write to Firestore before setting refs', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarAppUser(userInput);
    await expect(async () => await user.toAppFirestore()).rejects.toThrow(
      'User refs not set. Please use the setRefs method first.',
    );
  });

  it('throws if trying to update timestamp before setting refs', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarAppUser(userInput);
    await expect(async () => await user.updateFirestoreTimestamp()).rejects.toThrow(
      'User refs not set. Please use the setRefs method first.',
    );
  });

  it('creates a new Firestore document', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarAppUser(userInput);
    user.setRefs(rootDoc);
    try {
      await user.toAppFirestore();
      expect(user.isPushedToFirestore).toBe(true);

      // Sign out this user and sign in the roar-ci-user,
      // which has special permissions to read and delete user data
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteUser(app.auth.currentUser!);
      await signInWithEmailAndPassword(app.auth, ciEmail, ciPassword);

      // Expect contents of user document to match
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const docSnap = await getDoc(user.userRef!);
      expect(docSnap.exists()).toBe(true);
      expect(docSnap.data()).toEqual(
        expect.objectContaining({
          id: user.id,
          firebaseUid: user.firebaseUid,
          birthMonth: user.birthMonth,
          birthYear: user.birthYear,
          classId: user.classId,
          schoolId: user.schoolId,
          districtId: user.districtId,
          studies: user.studies,
          userCategory: user.userCategory,
          districts: [user.districtId],
          schools: [user.schoolId],
          classes: [user.classId],
          lastUpdated: expect.any(Timestamp),
          createdAt: expect.any(Timestamp),
        }),
      );
    } finally {
      // Delete the user document and sign out
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteDoc(user.userRef!);
    }
  });

  it('updates an existing Firestore document', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarAppUser(userInput);
    user.setRefs(rootDoc);

    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await setDoc(user.userRef!, {
        firebaseUid: userInput.firebaseUid,
      });

      await user.toAppFirestore();
      expect(user.isPushedToFirestore).toBe(true);

      // Sign out this user and sign in the roar-ci-user,
      // which has special permissions to read and delete user data
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteUser(app.auth.currentUser!);
      await signInWithEmailAndPassword(app.auth, ciEmail, ciPassword);

      // Expect contents of user document to match
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const docSnap = await getDoc(user.userRef!);
      expect(docSnap.exists()).toBe(true);
      expect(docSnap.data()).toEqual(
        expect.objectContaining({
          id: user.id,
          firebaseUid: user.firebaseUid,
          birthMonth: user.birthMonth,
          birthYear: user.birthYear,
          classId: user.classId,
          schoolId: user.schoolId,
          districtId: user.districtId,
          studies: user.studies,
          userCategory: user.userCategory,
          districts: [user.districtId],
          schools: [user.schoolId],
          classes: [user.classId],
          lastUpdated: expect.any(Timestamp),
        }),
      );
    } finally {
      // Delete the user document and sign out
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteDoc(user.userRef!);
    }
  });

  it('updates the server timestamp', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarAppUser(userInput);
    user.setRefs(rootDoc);

    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await setDoc(user.userRef!, {
        firebaseUid: userInput.firebaseUid,
      });
      await user.updateFirestoreTimestamp();

      // Sign out this user and sign in the roar-ci-user,
      // which has special permissions to read and delete user data
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteUser(app.auth.currentUser!);
      await signInWithEmailAndPassword(app.auth, ciEmail, ciPassword);

      // Expect contents of user document to match
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const docSnap = await getDoc(user.userRef!);
      expect(docSnap.exists()).toBe(true);
      expect(docSnap.data()).toEqual(
        expect.objectContaining({
          firebaseUid: user.firebaseUid,
          lastUpdated: expect.any(Timestamp),
        }),
      );
    } finally {
      // Delete the user document and sign out
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteDoc(user.userRef!);
    }
  });

  it('prohibits writing data to other users', async () => {
    const userInput = await getRandomUserInput();
    userInput.firebaseUid = 'other-user';
    const user = new RoarAppUser(userInput);
    user.setRefs(rootDoc);
    await expect(async () => await user.toAppFirestore()).rejects.toThrow('Missing or insufficient permissions.');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await deleteUser(app.auth.currentUser!);
  });
});
