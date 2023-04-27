import {
  collection,
  CollectionReference,
  doc,
  DocumentReference,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { removeNull } from './util';

export interface ITaskVariantInput {
  taskId: string;
  taskName: string;
  variantName: string;
  taskDescription?: string | null;
  variantDescription?: string | null;
  srcHash?: string | null;
}

interface IFirestoreTaskData {
  id: string;
  name: string;
  description?: string | null;
  lastUpdated: ReturnType<typeof serverTimestamp>;
}

/** Class representing a ROAR task
 * @param {string} taskId - The ID of the parent task. Should be a short initialism, e.g. "swr" or "srf"
 * @param {string} taskName - The name of the parent task
 * @param {string} taskDescription - The description of the task
 * @param {string} variantName - The name of the task variant
 * @param {string} variantDescription - The description of the variant
 */
export class RoarTaskVariant {
  taskId: string;
  taskName: string;
  taskDescription: string | null;
  taskRef: DocumentReference | undefined;
  variantId: string | undefined;
  variantName: string;
  variantDescription: string | null;
  variantRef: DocumentReference | undefined;
  variantsCollectionRef: CollectionReference | undefined;
  srcHash: string | null;
  constructor({
    taskId,
    taskName,
    variantName,
    taskDescription = null,
    variantDescription = null,
    srcHash = null,
  }: ITaskVariantInput) {
    this.taskId = taskId;
    this.taskName = taskName;
    this.taskDescription = taskDescription;
    this.variantName = variantName;
    this.variantDescription = variantDescription;
    this.srcHash = srcHash;

    this.taskRef = undefined;
    this.variantsCollectionRef = undefined;
    this.variantId = undefined;
    this.variantRef = undefined;
  }

  /** Set Firestore doc and collection references
   * @param {DocumentReference} rootDoc - The root document reference
   */
  setRefs(rootDoc: DocumentReference) {
    this.taskRef = doc(rootDoc, 'tasks', this.taskId);
    this.variantsCollectionRef = collection(this.taskRef, 'variants');
  }

  /**
   * Push the trial and trial variant to Firestore
   * @method
   * @async
   */
  async toFirestore() {
    if (this.taskRef === undefined || this.variantsCollectionRef === undefined) {
      throw new Error('Task refs not set. Please use the setRefs method first.');
    } else {
      // Push/update the task using the user provided task ID
      const taskData: IFirestoreTaskData = {
        id: this.taskId,
        name: this.taskName,
        description: this.taskDescription,
        lastUpdated: serverTimestamp(),
      };
      await setDoc(this.taskRef, taskData);

      // Need to push an empty variant first in order to query the (potentially
      // non-existent) variants collection
      const emptyVariantRef: DocumentReference = doc(this.taskRef, 'variants', 'empty');
      await setDoc(emptyVariantRef, {
        name: 'empty',
        srcHash: 'empty',
      });

      // Check to see if variant exists already by querying for a match on the
      // name, and srcHash.
      const q = query(
        this.variantsCollectionRef,
        where('name', '==', this.variantName),
        orderBy('lastPlayed', 'desc'),
        orderBy('srcHash'),
        limit(1),
      );
      const querySnapshot = await getDocs(q);

      // If this query snapshot yielded results, then we can use it and
      // update the timestamp
      querySnapshot.forEach((docRef) => {
        if (docRef.get('srcHash') === this.srcHash) {
          this.variantId = docRef.id;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          this.variantRef = doc(this.variantsCollectionRef!, this.variantId);
          updateDoc(
            this.variantRef,
            removeNull({
              description: this.variantDescription,
              lastPlayed: serverTimestamp(),
            }),
          );
        }
      });

      // If this.variantId is still undefined, then there was no match, We query
      // again, but this time allow the old variant style without a 'srcHash'
      // field
      if (this.variantId === undefined) {
        const q = query(
          this.variantsCollectionRef,
          where('name', '==', this.variantName),
          orderBy('lastPlayed', 'desc'),
          limit(1),
        );
        const querySnapshot = await getDocs(q);

        // If this query snapshot is yielded results, then we can use it and
        // update the timestamp and add a srcHash for next time.
        querySnapshot.forEach((docRef) => {
          this.variantId = docRef.id;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          this.variantRef = doc(this.variantsCollectionRef!, this.variantId);
          updateDoc(
            this.variantRef,
            removeNull({
              description: this.variantDescription,
              lastPlayed: serverTimestamp(),
              srcHash: this.srcHash,
            }),
          );
        });
      }

      // no match, ask Firestore to generate a new document id for the variant
      // and push it to Firestore.
      if (this.variantId === undefined) {
        const variantData = {
          name: this.variantName,
          description: this.variantDescription,
          srcHash: this.srcHash,
          lastPlayed: serverTimestamp(),
        };
        this.variantRef = doc(this.variantsCollectionRef);
        await setDoc(this.variantRef, variantData);
        this.variantId = this.variantRef.id;
      }
    }
  }
}
