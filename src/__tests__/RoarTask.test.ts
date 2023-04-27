import {
  collection,
  CollectionReference,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { v4 as uuidv4 } from 'uuid';
import { firebaseSignIn } from '../auth';
import { RoarTaskVariant } from '../firestore/task';
import { firebaseApp, rootDoc } from './__utils__/firebaseConfig';
import { email as ciEmail, password as ciPassword } from './__utils__/roarCIUser';

const auth = getAuth(firebaseApp);
const uid = `ci-user-task-tests`;

const taskInput = {
  taskId: `ci-task-${uuidv4()}`,
  taskName: 'test-task-name',
  variantName: 'a-test-variant-name',
  taskDescription: 'test-task-description',
  variantDescription: 'test-variant-description',
  srcHash: 'abcdefg',
};

describe('RoarTaskVariant', () => {
  afterAll(async () => {
    await signOut(auth);
  });

  it('constructs a task', () => {
    const task = new RoarTaskVariant(taskInput);
    expect(task.taskId).toBe(taskInput.taskId);
    expect(task.taskName).toBe(taskInput.taskName);
    expect(task.variantName).toBe(taskInput.variantName);
    expect(task.taskDescription).toBe(taskInput.taskDescription);
    expect(task.variantDescription).toBe(taskInput.variantDescription);
    expect(task.taskRef).toBeUndefined();
    expect(task.variantId).toBeUndefined();
    expect(task.variantRef).toBeUndefined();
    expect(task.variantsCollectionRef).toBeUndefined();
  });

  it('sets Firestore document references', () => {
    const task = new RoarTaskVariant(taskInput);
    task.setRefs(rootDoc);
    expect(task.taskRef).toBeInstanceOf(DocumentReference);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(task.taskRef!.id).toBe(doc(rootDoc, 'tasks', task.taskId).id);
    expect(task.variantsCollectionRef).toBeInstanceOf(CollectionReference);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(task.variantsCollectionRef!.id).toBe(collection(rootDoc, 'tasks', task.taskId, 'variants').id);
  });

  it('throws if trying to write to Firestore before setting refs', async () => {
    const task = new RoarTaskVariant(taskInput);
    await expect(async () => await task.toFirestore()).rejects.toThrow(
      'Task refs not set. Please use the setRefs method first.',
    );
  });

  it('creates new Firestore documents', async () => {
    await firebaseSignIn(uid);

    const task = new RoarTaskVariant(taskInput);
    task.setRefs(rootDoc);
    try {
      await task.toFirestore();
      expect(task.variantId).toBeTruthy();
      expect(task.variantRef).toBeInstanceOf(DocumentReference);

      // Sign out this user and sign in the roar-ci-user,
      // which has special permissions to read and delete task data
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await signInWithEmailAndPassword(auth, ciEmail, ciPassword);

      // Expect contents of task document to match
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const docSnap = await getDoc(task.taskRef!);
      expect(docSnap.exists()).toBe(true);
      expect(docSnap.data()).toEqual(
        expect.objectContaining({
          id: task.taskId,
          name: task.taskName,
          description: task.taskDescription,
          lastUpdated: expect.any(Timestamp),
        }),
      );

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const q = query(task.variantsCollectionRef!, where('name', '!=', 'empty'));

      const querySnapshot = await getDocs(q);
      expect(querySnapshot.empty).toBe(false);
      expect(querySnapshot.size).toBe(1);
      expect(querySnapshot.docs[0].data({ serverTimestamps: 'estimate' })).toEqual(
        expect.objectContaining({
          name: task.variantName,
          description: task.variantDescription,
          srcHash: task.srcHash,
          lastPlayed: expect.any(Timestamp),
        }),
      );
    } finally {
      // Delete the documents and sign out
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteDoc(doc(task.variantsCollectionRef!, 'empty'));
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteDoc(task.variantRef!);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteDoc(task.taskRef!);
    }
  });

  it('updates existing Firestore documents', async () => {
    await firebaseSignIn(uid);

    const task1 = new RoarTaskVariant(taskInput);
    const task2 = new RoarTaskVariant(taskInput);
    task2.variantName = 'b-another-variant-name';

    task1.setRefs(rootDoc);
    task2.setRefs(rootDoc);

    try {
      await task1.toFirestore();
      await task2.toFirestore();

      expect(task1.taskRef).toEqual(task2.taskRef);
      expect(task1.variantsCollectionRef).toEqual(task2.variantsCollectionRef);

      expect(task2.variantId).not.toEqual(task1.variantId);
      expect(task2.variantRef).not.toEqual(task1.variantRef);

      // Sign out this user and sign in the roar-ci-user,
      // which has special permissions to read and delete user data
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await signInWithEmailAndPassword(auth, ciEmail, ciPassword);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const q = query(task1.variantsCollectionRef!, where('name', '!=', 'empty'), orderBy('name'));

      const querySnapshot = await getDocs(q);
      expect(querySnapshot.empty).toBe(false);
      expect(querySnapshot.size).toBe(2);
      expect(querySnapshot.docs[0].data({ serverTimestamps: 'estimate' })).toEqual(
        expect.objectContaining({
          name: task1.variantName,
          description: task1.variantDescription,
          srcHash: task1.srcHash,
          lastPlayed: expect.any(Timestamp),
        }),
      );
      expect(querySnapshot.docs[1].data({ serverTimestamps: 'estimate' })).toEqual(
        expect.objectContaining({
          name: task2.variantName,
          description: task2.variantDescription,
          srcHash: task2.srcHash,
          lastPlayed: expect.any(Timestamp),
        }),
      );
      const oldTimeStamp = querySnapshot.docs[1].data({ serverTimestamps: 'estimate' }).lastPlayed;

      await firebaseSignIn(uid);
      await task2.toFirestore();
      await signInWithEmailAndPassword(auth, ciEmail, ciPassword);

      const updatedSnapshot = await getDocs(q);
      const newTimeStamp = updatedSnapshot.docs[1].data({ serverTimestamps: 'estimate' }).lastPlayed;
      expect(newTimeStamp).not.toEqual(oldTimeStamp);
    } finally {
      // Delete the documents and sign out
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteDoc(doc(task1.variantsCollectionRef!, 'empty'));
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteDoc(task1.variantRef!);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteDoc(task2.variantRef!);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await deleteDoc(task1.taskRef!);
    }
  });
});
