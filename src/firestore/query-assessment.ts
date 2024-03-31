import { DocumentData, Firestore, collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';

export const getTaskAndVariant = async ({
  db,
  taskId,
  variantParams,
}: {
  db: Firestore;
  taskId: string;
  variantParams: { [key: string]: unknown };
}) => {
  const taskRef = doc(db, 'tasks', taskId);
  const variantsCollectionRef = collection(taskRef, 'variants');

  const docSnap = await getDoc(taskRef);
  if (docSnap.exists()) {
    const taskData = docSnap.data();

    // Check to see if variant exists already by querying for a match on the params.
    const q = query(variantsCollectionRef, where('params', '==', variantParams), limit(1));

    const querySnapshot = await getDocs(q);

    let variantData: DocumentData | undefined;

    querySnapshot.forEach((docRef) => {
      variantData = {
        ...docRef.data(),
        id: docRef.id,
      };
    });

    return {
      task: taskData,
      variant: variantData,
    };
  }

  return {
    task: undefined,
    variant: undefined,
  };
};
