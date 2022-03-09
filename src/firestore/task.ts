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

interface Block {
  blockNumber: number;
  trialMethod: string;
  corpus: string;
}

export interface TaskVariantInput {
  taskId: string;
  taskName: string;
  variantName: string;
  taskDescription?: string | null;
  variantDescription?: string | null;
  blocks?: Block[];
}

interface FirestoreTaskData {
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
 * @param {Array} blocks - The blocks of this task variant
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
  blocks: Block[];
  constructor({
    taskId,
    taskName,
    variantName,
    taskDescription = null,
    variantDescription = null,
    blocks = [],
  }: TaskVariantInput) {
    this.taskId = taskId;
    this.taskName = taskName;
    this.taskDescription = taskDescription;
    this.variantName = variantName;
    this.variantDescription = variantDescription;
    this.blocks = blocks;

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

  /** Add a block to this experiment
   * @method
   * @param {number} blockNumber - The block index
   * @param {string} trialMethod - The trial sampling method
   * @param {string} corpus - The corpus from which stimuli are drawn
   */
  addBlock({ blockNumber = 0, trialMethod = 'practice', corpus = 'practiceCorpusId' }: Block) {
    this.blocks.push({
      blockNumber,
      trialMethod,
      corpus,
    });
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
      const taskData: FirestoreTaskData = {
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
        blocksString: 'empty',
      });

      // Check to see if variant exists already by querying for a match on the
      // name and the blocks.
      const q = query(
        this.variantsCollectionRef,
        where('name', '==', this.variantName),
        where('blocksString', '==', JSON.stringify(this.blocks)),
        orderBy('lastPlayed', 'desc'),
        limit(1),
      );
      const querySnapshot = await getDocs(q);

      // If so use the Firestore generated id for the variant and update timestamp.
      querySnapshot.forEach((docRef) => {
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
      });

      // If no match, ask Firestore to generate a new document id for the variant
      // and push it to Firestore.
      if (this.variantId === undefined) {
        const variantData = {
          name: this.variantName,
          description: this.variantDescription,
          blocks: this.blocks,
          blocksString: JSON.stringify(this.blocks),
          lastPlayed: serverTimestamp(),
        };
        this.variantRef = doc(this.variantsCollectionRef);
        await setDoc(this.variantRef, variantData);
        this.variantId = this.variantRef.id;
      }
    }
  }
}
