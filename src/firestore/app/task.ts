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
import { mergeGameParams, removeUndefined, replaceValues } from '../util';

export interface ITaskVariantInfo {
  taskId: string;
  taskName?: string;
  taskDescription?: string;
  variantName?: string;
  variantDescription?: string;
  variantParams: { [key: string]: unknown };
}

export interface ITaskVariantInput extends ITaskVariantInfo {
  db: Firestore;
}

export interface IFirestoreTaskData {
  name?: string;
  description?: string | null;
  image?: string;
  lastUpdated: ReturnType<typeof serverTimestamp>;
  registered?: boolean;
}

export interface ITaskData extends IFirestoreTaskData {
  id: string;
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
  private _firestoreUpdateAllowed: boolean;
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
    this._firestoreUpdateAllowed = false;
  }

  /**
   * Push the trial and trial variant to Firestore
   * @method
   * @async
   */
  async toFirestore() {
    // Push/update the task using the user provided task ID
    const taskData: IFirestoreTaskData = {
      name: this.taskName,
      description: this.taskDescription,
      lastUpdated: serverTimestamp(),
    };
    await setDoc(this.taskRef, removeUndefined(taskData), { merge: true });

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
        removeUndefined({
          description: this.variantDescription,
          lastUpdated: serverTimestamp(),
        }),
      );
    });

    // no match, ask Firestore to generate a new document id for the variant
    // and push it to Firestore.
    if (!this.variantId) {
      const variantData: IFirestoreVariantData = {
        name: this.variantName,
        description: this.variantDescription,
        params: this.variantParams,
        lastUpdated: serverTimestamp(),
      };
      this.variantRef = doc(this.variantsCollectionRef);
      await setDoc(this.variantRef, removeUndefined(variantData));
      this.variantId = this.variantRef.id;
    } else if (this._firestoreUpdateAllowed) {
      const variantData: IFirestoreVariantData = {
        name: this.variantName,
        description: this.variantDescription,
        params: this.variantParams,
        lastUpdated: serverTimestamp(),
      };
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await updateDoc(this.variantRef!, removeUndefined(variantData));
    }
  }

  /**
   * Update variant params in Firestore
   * @method
   * @param {object} newParams - The parameters of the task variant
   * @async
   */
  async updateTaskParams(newParams: { [key: string]: unknown }) {
    if (this.variantRef === undefined) {
      throw new Error(
        'Cannot update task params before writing task to Firestore. Please call `.toFirestore()` first.',
      );
    }

    const oldParams = replaceValues(this.variantParams);
    const cleanParams = replaceValues(newParams);

    // Only allow updating the task params if we are updating previously null values.
    const mergedParams = mergeGameParams(oldParams, cleanParams);

    this.variantParams = mergedParams;
    this._firestoreUpdateAllowed = true;
    await this.toFirestore().then(() => {
      this._firestoreUpdateAllowed = false;
    });
  }
}
