import { getAuth, deleteUser, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, DocumentReference, doc, getDoc, getDocs, Timestamp, deleteDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { RoarUser } from '../firestore/user';
import { convertTrialToFirestore, RoarRun } from '../firestore/run';
import { firebaseSignIn } from '../auth';
import { firebaseApp, rootDoc } from './__utils__/firebaseConfig';
import { RoarTaskVariant } from '../firestore/task';
import { email as ciEmail, password as ciPassword } from './__utils__/roarCIUser';

const auth = getAuth(firebaseApp);

const deleteDocs = async (docArray: (DocumentReference | null)[]) => {
  docArray.forEach(async (docRef) => {
    if (docRef) await deleteDoc(docRef);
  });
};

const getRandomUserInput = async (withSignIn = false) => {
  const uid = `ci-user-${uuidv4()}`;
  const userInput = {
    id: uid,
    firebaseUid: '',
    taskId: 'test-task-id',
    variantId: 'test-variant-id',
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

const taskInput = {
  taskId: `ci-task-${uuidv4()}`,
  taskName: 'test-task-name',
  variantName: 'a-test-variant-name',
  taskDescription: 'test-task-description',
  variantDescription: 'test-variant-description',
  blocks: [
    {
      blockNumber: 0,
      trialMethod: 'random',
      corpus: 'test-corpus',
    },
  ],
};

describe('convertTrialToFirestore', () => {
  it('converts URL objects to strings', () => {
    const input = {
      a: 1,
      b: 'foo',
      c: null,
      d: new URL('https://example.com'),
      e: {
        f: new URL('https://example.com'),
        g: 1,
        h: 'foo',
        i: null,
      },
    };
    const expected = {
      a: 1,
      b: 'foo',
      c: null,
      d: 'https://example.com/',
      e: {
        f: 'https://example.com/',
        g: 1,
        h: 'foo',
        i: null,
      },
    };

    expect(convertTrialToFirestore(input)).toEqual(expected);
  });
});

describe('RoarRun', () => {
  afterEach(async () => {
    await signOut(auth);
  });

  it('constructs a run', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    const task = new RoarTaskVariant(taskInput);
    user.setRefs(rootDoc);
    task.setRefs(rootDoc);
    const run = new RoarRun({ user, task });
    expect(run.user).toBe(user);
    expect(run.task).toBe(task);
    expect(run.runRef).toBeInstanceOf(DocumentReference);
    expect(run.started).toBe(false);
  });

  it('throws an error if user is not a student', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    const task = new RoarTaskVariant(taskInput);
    user.userCategory = 'educator';
    user.setRefs(rootDoc);
    task.setRefs(rootDoc);
    expect(() => new RoarRun({ user, task })).toThrow('Only students can start a run.');
  });

  it('throws an error if user refs not set', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    const task = new RoarTaskVariant(taskInput);
    task.setRefs(rootDoc);
    expect(() => new RoarRun({ user, task })).toThrow('User refs not set. Please use the user.setRefs method first.');
  });

  it('throws an error if task refs not set', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    const task = new RoarTaskVariant(taskInput);
    user.setRefs(rootDoc);
    expect(() => new RoarRun({ user, task })).toThrow('Task refs not set. Please use the task.setRefs method first.');
  });

  it('starts a run', async () => {
    const userInput = await getRandomUserInput(true);
    const user = new RoarUser(userInput);
    const task = new RoarTaskVariant(taskInput);
    user.setRefs(rootDoc);
    task.setRefs(rootDoc);
    const run = new RoarRun({ user, task });

    // Confirm that user and task are not intially pushed to Firestore
    expect(run.user.isPushedToFirestore).toBe(false);
    expect(run.task.variantRef).toBeUndefined();

    try {
      await run.startRun();

      // Confirm that user and task are now pushed to Firestore
      expect(run.user.userRef).toBeInstanceOf(DocumentReference);
      expect(run.task.taskRef).toBeInstanceOf(DocumentReference);
      expect(run.task.variantRef).toBeInstanceOf(DocumentReference);
      expect(run.started).toBe(true);

      // Sign out this user and sign in the roar-ci-user,
      // which has special permissions to read and delete user data
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteUser(auth.currentUser!);
      await signInWithEmailAndPassword(auth, ciEmail, ciPassword);

      // Expect that the task was added to the user doc
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const userdocSnap = await getDoc(user.userRef!);
      expect(userdocSnap.exists()).toBe(true);
      expect(userdocSnap.data()).toEqual(
        expect.objectContaining({
          tasks: [run.task.taskId],
          variants: [run.task.variantId],
          lastUpdated: expect.any(Timestamp),
        }),
      );

      // Expect contents of the run document to match
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const runDocSnap = await getDoc(run.runRef!);
      expect(runDocSnap.exists()).toBe(true);
      expect(runDocSnap.data()).toEqual(
        expect.objectContaining({
          districtId: run.user.districtId,
          schoolId: run.user.schoolId,
          classId: run.user.classId,
          studyId: run.user.studyId,
          taskId: run.task.taskId,
          variantId: run.task.variantId,
          taskRef: expect.any(DocumentReference),
          variantRef: expect.any(DocumentReference),
          completed: false,
          timeStarted: expect.any(Timestamp),
          timeFinished: null,
        }),
      );
    } finally {
      // Delete all created docs
      await deleteDocs([
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        doc(run.task.variantsCollectionRef!, 'empty'),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        run.task.variantRef!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        run.task.taskRef!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        run.runRef!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        run.user.userRef!,
      ]);
    }
  });

  it('finishes a run', async () => {
    const userInput = await getRandomUserInput(true);
    const user = new RoarUser(userInput);
    const task = new RoarTaskVariant(taskInput);
    user.setRefs(rootDoc);
    task.setRefs(rootDoc);
    const run = new RoarRun({ user, task });

    try {
      await run.startRun();
      await run.finishRun();

      // Sign out this user and sign in the roar-ci-user,
      // which has special permissions to read and delete user data
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteUser(auth.currentUser!);
      await signInWithEmailAndPassword(auth, ciEmail, ciPassword);

      // Expect contents of the run document to match
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const runDocSnap = await getDoc(run.runRef!);
      expect(runDocSnap.exists()).toBe(true);
      expect(runDocSnap.data()).toEqual(
        expect.objectContaining({
          completed: true,
          timeFinished: expect.any(Timestamp),
        }),
      );
    } finally {
      // Delete all created docs
      await deleteDocs([
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        doc(run.task.variantsCollectionRef!, 'empty'),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        run.task.variantRef!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        run.task.taskRef!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        run.runRef!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        run.user.userRef!,
      ]);
    }
  });

  it('throws if trying to finish a run that has not started', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    const task = new RoarTaskVariant(taskInput);
    user.setRefs(rootDoc);
    task.setRefs(rootDoc);
    const run = new RoarRun({ user, task });

    await expect(async () => await run.finishRun()).rejects.toThrow(
      'Run has not been started yet. Use the startRun method first.',
    );
  });

  it('throws if trying to write a trial to a run that has not started', async () => {
    const userInput = await getRandomUserInput();
    const user = new RoarUser(userInput);
    const task = new RoarTaskVariant(taskInput);
    user.setRefs(rootDoc);
    task.setRefs(rootDoc);
    const run = new RoarRun({ user, task });

    await expect(async () => await run.writeTrial({ a: 0 })).rejects.toThrow(
      'Run has not been started yet. Use the startRun method first.',
    );
  });

  it('writes a trial', async () => {
    const userInput = await getRandomUserInput(true);
    const user = new RoarUser(userInput);
    const task = new RoarTaskVariant(taskInput);
    user.setRefs(rootDoc);
    task.setRefs(rootDoc);
    const run = new RoarRun({ user, task });

    let trialDocRef: DocumentReference | null = null;
    try {
      await run.startRun();

      const trialData = {
        correct: false,
        response: 0,
        rt: 1422,
        saveToFireStore: true,
        trial_index: 3,
        trail_type: 'image-button-response',
        stimulus: new URL('https://example.com/stimulus.png'),
        internal_node_id: '0.0-2.0-1.0',
      };

      await run.writeTrial(trialData);

      // Sign out this user and sign in the roar-ci-user,
      // which has special permissions to read and delete user data
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteUser(auth.currentUser!);
      await signInWithEmailAndPassword(auth, ciEmail, ciPassword);

      // Expect contents of the run document to match
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const trialsCollectionRef = collection(run.runRef, 'trials');
      const trialDocsSnap = await getDocs(trialsCollectionRef);
      expect(trialDocsSnap.empty).toBe(false);
      expect(trialDocsSnap.size).toBe(1);
      expect(trialDocsSnap.docs[0].data({ serverTimestamps: 'estimate' })).toEqual(
        expect.objectContaining(convertTrialToFirestore(trialData)),
      );

      trialDocRef = trialDocsSnap.docs[0].ref;
    } finally {
      // Delete all created docs
      await deleteDocs([
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        trialDocRef,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        doc(run.task.variantsCollectionRef!, 'empty'),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        run.task.variantRef!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        run.task.taskRef!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        run.runRef!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        run.user.userRef!,
      ]);
    }
  });
});
