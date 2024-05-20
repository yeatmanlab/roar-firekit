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

export interface TaskVariantInfo {
  taskId: string;
  taskName?: string;
  taskDescription?: string;
  taskImage?: string;
  taskURL?: string;
  taskVersion?: string;
  external?: boolean;
  variantId?: string;
  variantName?: string;
  variantDescription?: string;
  variantParams?: { [key: string]: unknown };
  testData?: TaskVariantDataFlags;
  demoData?: TaskVariantDataFlags;
  isStandalone: boolean;
}

export interface TaskVariantInput extends TaskVariantInfo {
  db: Firestore;
}

export interface FirestoreTaskData {
  name?: string;
  description?: string | null;
  image?: string;
  taskURL?: string;
  external?: boolean;
  lastUpdated: ReturnType<typeof serverTimestamp>;
  registered?: boolean;
  testData?: boolean;
  demoData?: boolean;
}

export interface TaskData extends FirestoreTaskData {
  id: string;
}

export interface FirestoreVariantData {
  name?: string;
  description?: string | null;
  taskURL?: string;
  external?: boolean;
  params: { [key: string]: unknown };
  lastUpdated: ReturnType<typeof serverTimestamp>;
  testData?: boolean;
  demoData?: boolean;
}

interface TaskVariantDataFlags {
  task?: boolean;
  variant?: boolean;
}

/**
 * Class representing a ROAR task.
 */
export class RoarTaskVariant {
  db: Firestore;
  taskId: string;
  taskName?: string;
  taskDescription?: string;
  taskImage?: string;
  taskURL?: string;
  taskVersion?: string;
  external?: boolean;
  taskRef: DocumentReference;
  variantId?: string;
  variantName?: string;
  variantDescription?: string;
  variantParams: { [key: string]: unknown };
  variantRef: DocumentReference | undefined;
  variantsCollectionRef: CollectionReference;
  isStandalone: boolean;
  testData: TaskVariantDataFlags;
  demoData: TaskVariantDataFlags;
  /** Create a ROAR task
   * @param {TaskVariantInput} input
   * @param {Firestore} input.db - The assessment Firestore instance to which this task'data will be written
   * @param {string} input.taskId - The ID of the parent task. Should be a short initialism, e.g. "swr" or "sre"
   * @param {string} input.taskName - The name of the parent task
   * @param {string} input.taskDescription - The description of the task
   * @param {string} input.variantId - The image of the task
   * @param {string} input.variantName - The name of the task variant
   * @param {string} input.variantDescription - The description of the variant
   * @param {object} input.variantParams - The parameters of the task variant
   * @param {TaskVariantDataFlags} input.testData = Boolean flags indicating test data
   * @param {TaskVariantDataFlags} input.demoData = Boolean flags indicating demo data
   */
  constructor({
    db,
    taskId,
    taskName,
    taskDescription,
    taskImage,
    taskURL,
    taskVersion = undefined,
    external,
    variantId,
    variantName,
    variantDescription,
    variantParams = {},
    isStandalone = false,
    testData = { task: false, variant: false },
    demoData = { task: false, variant: false },
  }: TaskVariantInput) {
    this.db = db;
    this.taskId = taskId.toLowerCase();
    this.taskName = taskName;
    this.taskDescription = taskDescription;
    this.taskImage = taskImage;
    this.taskURL = taskURL;
    this.taskVersion = taskVersion;
    this.external = external;
    this.variantName = variantName;
    this.variantDescription = variantDescription;
    this.variantParams = variantParams;
    this.testData = testData;
    this.demoData = demoData;
    this.isStandalone = isStandalone;

    if (isStandalone && variantId) {
      throw new Error('Passing in an explicit variant ID is not allowed in standalone mode.');
    }

    if (!isStandalone && !variantId) {
      throw new Error('A variant ID is required in package mode.');
    }

    if (!isStandalone && Object.keys(variantParams).length > 0) {
      throw new Error('Variant parameters are not allowed in package mode.');
    }

    this.taskRef = doc(this.db, 'tasks', this.taskId);

    if (this.isStandalone) {
      this.variantsCollectionRef = collection(this.taskRef, 'standaloneVariants');
      this.variantId = undefined;
      this.variantRef = undefined;
    } else {
      this.variantsCollectionRef = collection(this.taskRef, 'variants');
      this.variantId = variantId;
      this.variantRef = doc(this.variantsCollectionRef, this.variantId);
    }
  }

  /**
   * Push the trial and trial variant to Firestore
   * @method
   * @async
   */
  async toFirestore() {
    if (this.isStandalone) {
      // Push/update the task using the user provided task ID
      const taskData: FirestoreTaskData = {
        name: this.taskName,
        description: this.taskDescription,
        image: this.taskImage,
        taskURL: this.taskURL,
        external: this.external,
        lastUpdated: serverTimestamp(),
        // Use conditional spreading to add the testData flag only if it exists on
        // the userDoc and is true.
        // Explaination: We use the && operator to return the object only when
        // condition is true. If the object is returned then it will be spread
        // into runData.
        ...(this.testData.task && { testData: true }),
        // Same for demoData
        ...(this.demoData.task && { demoData: true }),
      };

      await setDoc(this.taskRef, removeUndefined(taskData), { merge: true });

      // Check to see if variant exists already by querying for a match on the params.
      const q = query(
        this.variantsCollectionRef,
        where('params', '==', this.variantParams),
        orderBy('lastUpdated', 'desc'),
        limit(1),
      );
      const querySnapshot = await getDocs(q);

      let foundVariantWithCurrentParams = false;

      // If this query snapshot yielded results, then we can use it and
      // update the timestamp
      querySnapshot.forEach((docRef) => {
        this.variantId = docRef.id;
        this.variantRef = doc(this.variantsCollectionRef, this.variantId);
        foundVariantWithCurrentParams = true;

        updateDoc(
          this.variantRef,
          removeUndefined({
            description: this.variantDescription,
            lastUpdated: serverTimestamp(),
          }),
        );
      });

      const variantData: FirestoreVariantData = {
        name: this.variantName,
        description: this.variantDescription,
        taskURL: this.taskURL,
        external: this.external,
        params: this.variantParams,
        lastUpdated: serverTimestamp(),
        // See comments about conditional spreading above
        ...(this.testData.variant && { testData: true }),
        ...(this.demoData.variant && { demoData: true }),
      };

      if (!foundVariantWithCurrentParams) {
        this.variantRef = doc(this.variantsCollectionRef);
        await setDoc(this.variantRef, removeUndefined(variantData));
        this.variantId = this.variantRef.id;
      }
    } else {
      await updateDoc(this.taskRef, { lastUpdated: serverTimestamp() }).then(() => {
        return updateDoc(this.variantRef!, { lastUpdated: serverTimestamp() });
      });
    }
  }

  /**
   * Update variant params in Firestore
   * @method
   * @param {object} newParams - The parameters of the task variant
   * @async
   */
  async updateTaskParams(newParams: { [key: string]: unknown }) {
    if (!this.isStandalone) {
      throw new Error('Cannot update task params in package mode.');
    }

    if (this.variantRef === undefined) {
      throw new Error(
        'Cannot update task params before writing task to Firestore. Please call `.toFirestore()` first.',
      );
    }

    const oldParams = replaceValues(this.variantParams);
    const cleanParams = replaceValues(newParams);

    // Only allow updating the task params if we are updating previously null values.
    const { merged } = mergeGameParams(oldParams, cleanParams);

    this.variantParams = merged;
    await this.toFirestore();
  }
}
