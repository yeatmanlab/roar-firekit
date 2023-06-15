import {
  CollectionReference,
  DocumentReference,
  Firestore,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { removeNull } from '../util';

export interface ITaskVariantInput {
  db: Firestore;
  taskId: string;
  taskName?: string;
  taskDescription?: string;
  variantName?: string;
  variantDescription?: string;
  variantParams: { [key: string]: unknown };
}

export interface IFirestoreTaskData {
  id: string;
  name?: string;
  description?: string | null;
  lastUpdated: ReturnType<typeof serverTimestamp>;
}

export interface IFirestoreVariantData {
  name?: string;
  description?: string | null;
  params: { [key: string]: unknown };
  lastUpdated: ReturnType<typeof serverTimestamp>;
}

/**
 * Class representing a ROAR task.
 */
export class RoarTaskVariant {
  db: Firestore;
  taskId: string;
  taskName?: string;
  taskDescription?: string;
  taskRef: DocumentReference;
  variantId?: string;
  variantName?: string;
  variantDescription?: string;
  variantParams: { [key: string]: unknown };
  variantRef: DocumentReference | undefined;
  variantsCollectionRef: CollectionReference;
  /** Create a ROAR task
   * @param {ITaskVariantInput} input
   * @param {Firestore} input.db - The assessment Firestore instance to which this task'data will be written
   * @param {string} input.taskId - The ID of the parent task. Should be a short initialism, e.g. "swr" or "sre"
   * @param {string} input.taskName - The name of the parent task
   * @param {string} input.taskDescription - The description of the task
   * @param {string} input.variantName - The name of the task variant
   * @param {string} input.variantDescription - The description of the variant
   * @param {object} input.variantParams - The parameters of the task variant
   */
  constructor({
    db,
    taskId,
    taskName,
    taskDescription,
    variantName,
    variantDescription,
    variantParams = {},
  }: ITaskVariantInput) {
    this.db = db;
    this.taskId = taskId;
    this.taskName = taskName;
    this.taskDescription = taskDescription;
    this.variantName = variantName;
    this.variantDescription = variantDescription;
    this.variantParams = variantParams;

    this.taskRef = doc(this.db, 'tasks', this.taskId);
    this.variantsCollectionRef = collection(this.taskRef, 'variants');
    this.variantId = undefined;
    this.variantRef = undefined;
  }

  /**
   * Push the trial and trial variant to Firestore
   * @method
   * @async
   */
  async toFirestore() {
    // Push/update the task using the user provided task ID
    const taskData: IFirestoreTaskData = {
      id: this.taskId,
      name: this.taskName,
      description: this.taskDescription,
      lastUpdated: serverTimestamp(),
    };
    await setDoc(this.taskRef, removeNull(taskData), { merge: true });

    // Check to see if variant exists already by querying for a match on the
    // params.
    const q = query(
      this.variantsCollectionRef,
      where('params', '==', this.variantParams),
      orderBy('lastUpdated', 'desc'),
      limit(1),
    );
    const querySnapshot = await getDocs(q);

    // If this query snapshot yielded results, then we can use it and
    // update the timestamp
    querySnapshot.forEach((docRef) => {
      this.variantId = docRef.id;
      this.variantRef = doc(this.variantsCollectionRef, this.variantId);
      updateDoc(
        this.variantRef,
        removeNull({
          description: this.variantDescription,
          lastUpdated: serverTimestamp(),
        }),
      );
    });

    // no match, ask Firestore to generate a new document id for the variant
    // and push it to Firestore.
    if (this.variantId === undefined) {
      const variantData: IFirestoreVariantData = {
        name: this.variantName,
        description: this.variantDescription,
        params: this.variantParams,
        lastUpdated: serverTimestamp(),
      };
      this.variantRef = doc(this.variantsCollectionRef);
      await setDoc(this.variantRef, variantData);
      this.variantId = this.variantRef.id;
    }
  }
}
