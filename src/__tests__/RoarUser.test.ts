import { doc, DocumentReference, getDoc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth';
import { v4 as uuidv4 } from 'uuid';
import { RoarUser } from '../firestore/user';
import { firebaseSignIn } from '../auth';
import { firebaseApp, rootDoc } from './__utils__/firebaseConfig';
import { email as ciEmail, password as ciPassword } from './__utils__/roarCIUser';

const auth = getAuth(firebaseApp);

const getRandomUserInput = async (withSignIn = false) => {
  const uid = `ci-user-${uuidv4()}`;
  const userInput = {
    id: uid,
    firebaseUid: '',
    birthMonth: 1,
    birthYear: 1983,
    classId: 'test-class-id',
    schoolId: 'test-school-id',
    districtId: 'test-district-id',
    studyId: 'test-study-id',
    userCategory: 'student' as const,
  };

  if (withSignIn) {
    await firebaseSignIn(uid);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    userInput.firebaseUid = auth.currentUser!.uid;
  } else {
    userInput.firebaseUid = 'test-firebase-uid';
  }

  return userInput;
};

describe('RoarUser', () => {
  afterEach(async () => {
    await signOut(auth);
  });

  it('constructs a user', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    expect(user.id).toBe(userInput.id);
    expect(user.firebaseUid).toBe(userInput.firebaseUid);
    expect(user.birthMonth).toBe(userInput.birthMonth);
    expect(user.birthYear).toBe(userInput.birthYear);
    expect(user.classId).toBe(userInput.classId);
    expect(user.schoolId).toBe(userInput.schoolId);
    expect(user.districtId).toBe(userInput.districtId);
    expect(user.studyId).toBe(userInput.studyId);
    expect(user.userCategory).toBe(userInput.userCategory);
    expect(user.isPushedToFirestore).toBe(false);
    expect(user.assessmentDocRef).toBeUndefined();
  });

  it('validates userCategory input', async () => {
    await expect(async () => {
      const userInput = await getRandomUserInput();
      const invalidInput = Object.create(userInput);
      invalidInput.userCategory = 'superhero';
      new RoarUser(invalidInput);
    }).rejects.toThrow('User category must be one of student, educator, researcher.');
  });

  it('sets Firestore document references', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    user.setRefs(rootDoc);
    expect(user.assessmentDocRef).toBeInstanceOf(DocumentReference);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(user.assessmentDocRef!.id).toBe(doc(rootDoc, 'users', user.id).id);
  });

  it('throws if trying to write to Firestore before setting refs', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    await expect(async () => await user.toFirestore()).rejects.toThrow(
      'User refs not set. Please use the setRefs method first.',
    );
  });

  it('throws if trying to update timestamp before setting refs', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    await expect(async () => await user.updateFirestoreTimestamp()).rejects.toThrow(
      'User refs not set. Please use the setRefs method first.',
    );
  });

  it('creates a new Firestore document', async () => {
    const userInput = await getRandomUserInput(true);
    const user = new RoarUser(userInput);
    user.setRefs(rootDoc);
    try {
      await user.toFirestore();
      expect(user.isPushedToFirestore).toBe(true);

      // Sign out this user and sign in the roar-ci-user,
      // which has special permissions to read and delete user data
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteUser(auth.currentUser!);
      await signInWithEmailAndPassword(auth, ciEmail, ciPassword);

      // Expect contents of user document to match
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const docSnap = await getDoc(user.assessmentDocRef!);
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
          studyId: user.studyId,
          userCategory: user.userCategory,
          studies: [user.studyId],
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
      await deleteDoc(user.assessmentDocRef!);
    }
  });

  it('updates an existing Firestore document', async () => {
    const userInput = await getRandomUserInput(true);
    const user = new RoarUser(userInput);
    user.setRefs(rootDoc);

    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await setDoc(user.assessmentDocRef!, {
        firebaseUid: userInput.firebaseUid,
      });

      await user.toFirestore();
      expect(user.isPushedToFirestore).toBe(true);

      // Sign out this user and sign in the roar-ci-user,
      // which has special permissions to read and delete user data
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteUser(auth.currentUser!);
      await signInWithEmailAndPassword(auth, ciEmail, ciPassword);

      // Expect contents of user document to match
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const docSnap = await getDoc(user.assessmentDocRef!);
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
          studyId: user.studyId,
          userCategory: user.userCategory,
          studies: [user.studyId],
          districts: [user.districtId],
          schools: [user.schoolId],
          classes: [user.classId],
          lastUpdated: expect.any(Timestamp),
        }),
      );
    } finally {
      // Delete the user document and sign out
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteDoc(user.assessmentDocRef!);
    }
  });

  it('updates the server timestamp', async () => {
    const userInput = await getRandomUserInput(true);
    const user = new RoarUser(userInput);
    user.setRefs(rootDoc);

    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await setDoc(user.assessmentDocRef!, {
        firebaseUid: userInput.firebaseUid,
      });
      await user.updateFirestoreTimestamp();

      // Sign out this user and sign in the roar-ci-user,
      // which has special permissions to read and delete user data
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteUser(auth.currentUser!);
      await signInWithEmailAndPassword(auth, ciEmail, ciPassword);

      // Expect contents of user document to match
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const docSnap = await getDoc(user.assessmentDocRef!);
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
      await deleteDoc(user.assessmentDocRef!);
    }
  });

  it('prohibits writing data to other users', async () => {
    const userInput = await getRandomUserInput(true);
    userInput.firebaseUid = 'other-user';
    const user = new RoarUser(userInput);
    user.setRefs(rootDoc);
    await expect(async () => await user.toFirestore()).rejects.toThrow('Missing or insufficient permissions.');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await deleteUser(auth.currentUser!);
  });
});
