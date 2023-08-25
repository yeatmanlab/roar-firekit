import {
  DocumentData,
  DocumentReference,
  Firestore,
  Query,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { getOrgs, IUserDocument, userHasSelectedOrgs } from './util';
import { IFirestoreTaskData, ITaskData } from './app/task';

export const getTasks = async (db: Firestore, requireRegistered = true) => {
  let q: ReturnType<typeof query>;
  if (requireRegistered) {
    q = query(collection(db, 'tasks'), where('registered', '==', true));
  } else {
    q = query(collection(db, 'tasks'));
  }

  const tasksSnapshot = await getDocs(q);

  const tasks: ITaskData[] = [];
  tasksSnapshot.forEach((doc) => {
    const docData = doc.data() as IFirestoreTaskData;
    tasks.push({
      id: doc.id,
      image: docData.image,
      name: docData.name,
      description: docData.description,
      registered: docData.registered,
      ...docData,
    });
  });
  return tasks;
};

interface IVariant {
  id: string;
  name: string;
  params: { [key: string]: unknown };
  registered?: boolean;
  lastUpdated?: Timestamp;
}

export interface ITaskVariant {
  id: string;
  task: ITaskData;
  variant: IVariant;
}

export const getVariants = async (db: Firestore, requireRegistered = true) => {
  const taskVariants: ITaskVariant[] = [];

  const tasks = await getTasks(db, requireRegistered);
  for (const task of tasks) {
    let q: ReturnType<typeof query>;
    if (requireRegistered) {
      q = query(collection(db, 'tasks', task.id, 'variants'), where('registered', '==', true));
    } else {
      q = query(collection(db, 'tasks', task.id, 'variants'));
    }

    const snapshot = await getDocs(q);

    snapshot.forEach((doc) => {
      if (doc.id !== 'empty') {
        const docData = doc.data() as DocumentData;
        taskVariants.push({
          id: doc.id,
          task,
          variant: {
            id: doc.id,
            name: docData.name,
            params: docData.params,
            registered: docData.registered,
            lastUpdated: docData.lastUpdated,
            ...docData,
          },
        });
      }
    });
  }

  return taskVariants;
};

interface IUser {
  roarUid: string;
  districts: string[];
  schools: string[];
  groups: string[];
  classes: string[];
}

export const queryUsers = async (rootDoc: DocumentReference, taskIds: string[], variantIds: string[]) => {
  const users: IUser[] = [];

  if (taskIds.length > 0) {
    let userQuery;
    if (variantIds.length > 0) {
      userQuery = query(collection(rootDoc, 'users'), where('variants', 'array-contains-any', variantIds));
    } else {
      userQuery = query(collection(rootDoc, 'users'), where('tasks', 'array-contains-any', taskIds));
    }

    const usersSnapshot = await getDocs(userQuery);
    usersSnapshot.forEach((doc) => {
      const { districtIds, schoolIds, groupIds, classIds } = getOrgs(doc.data() as IUserDocument);

      users.push({
        roarUid: doc.id,
        districts: districtIds,
        schools: schoolIds,
        groups: groupIds,
        classes: classIds,
      });
    });
  }

  return users;
};

interface IUserFilter {
  districts: string[];
  schools: string[];
  classes: string[];
  groups: string[];
}

export const formatDate = (date: Date | undefined) => date?.toLocaleString('en-US');

interface IRunDocument {
  timeStarted?: Timestamp;
  timeFinished?: Timestamp;
  taskId?: string;
  variantId?: string;
  districtId?: string;
  schoolId?: string;
  classId?: string;
  groupId?: string;
  taskRef?: DocumentReference;
  variantRef?: DocumentReference;
  [x: string]: unknown;
}

interface IRun {
  roarUid: string;
  runId: string;
  timeStarted?: string | null;
  timeFinished?: string | null;
  task?: { id?: string };
  variant?: { id?: string };
  district?: { id?: string };
  school?: { id?: string };
  class?: { id?: string };
  group?: { id?: string };
  [x: string]: unknown;
}

export const getUserRuns = async (
  rootDoc: DocumentReference,
  user: IUser,
  filters: IUserFilter,
  taskIds: string[],
  variantIds: string[],
) => {
  const runs: IRun[] = [];
  const { roarUid, districts, schools, classes, groups } = user;

  const filterOrgs = [
    userHasSelectedOrgs(districts, filters.districts),
    userHasSelectedOrgs(schools, filters.schools),
    userHasSelectedOrgs(classes, filters.classes),
    userHasSelectedOrgs(groups, filters.groups),
  ];
  const isUserSelected = filterOrgs.every((element) => element === true);

  if (isUserSelected) {
    let runsQuery: Query;
    if (variantIds.length > 0) {
      runsQuery = query(collection(rootDoc, 'users', roarUid, 'runs'), where('variantId', 'in', variantIds));
    } else {
      runsQuery = query(collection(rootDoc, 'users', roarUid, 'runs'), where('taskId', 'in', taskIds));
    }

    const runsSnapshot = await getDocs(runsQuery);
    runsSnapshot.forEach((doc) => {
      const firestoreRun: IRunDocument = doc.data();
      const runData: IRun = {
        roarUid: roarUid,
        runId: doc.id,
      };

      runData.timeStarted = formatDate(firestoreRun.timeStarted?.toDate()) || null;
      runData.timeFinished = formatDate(firestoreRun.timeFinished?.toDate()) || null;
      runData.task = { id: firestoreRun.taskId };
      runData.variant = { id: firestoreRun.variantId };
      runData.district = { id: firestoreRun.districtId };
      runData.school = { id: firestoreRun.schoolId };
      runData.class = { id: firestoreRun.classId };
      runData.group = { id: firestoreRun.groupId };

      delete firestoreRun.taskRef;
      delete firestoreRun.variantRef;
      delete firestoreRun.taskId;
      delete firestoreRun.variantId;
      delete firestoreRun.districtId;
      delete firestoreRun.schoolId;
      delete firestoreRun.classId;
      delete firestoreRun.groupId;
      delete firestoreRun.timeStarted;
      delete firestoreRun.timeFinished;

      runs.push({
        ...runData,
        ...(firestoreRun as IRun),
      });
    });
  }

  return runs;
};

interface ITrialDocument {
  timeStarted?: Timestamp;
  timeFinished?: Timestamp;
  taskId?: string;
  variantId?: string;
  districtId?: string;
  schoolId?: string;
  classId?: string;
  groupId?: string;
  [x: string]: unknown;
}

interface ITrial {
  roarUid: string;
  runId: string;
  timeStarted?: string | null;
  timeFinished?: string | null;
  task?: { id?: string };
  variant?: { id?: string };
  district?: { id?: string };
  school?: { id?: string };
  class?: { id?: string };
  group?: { id?: string };
  [x: string]: unknown;
}

export const getRunTrials = async (rootDoc: DocumentReference, run: IRun) => {
  const trialsQuery = query(collection(rootDoc, 'users', run.roarUid, 'runs', run.runId, 'trials'));
  const trialsSnapshot = await getDocs(trialsQuery);
  const trials: ITrial[] = [];

  trialsSnapshot.forEach((doc) => {
    const firestoreTrial: ITrialDocument = doc.data();
    const trialData: ITrial = {
      roarUid: run.roarUid,
      runId: run.runId,
    };

    trialData.timeStarted = formatDate(firestoreTrial.timeStarted?.toDate()) || null;
    trialData.timeFinished = formatDate(firestoreTrial.timeFinished?.toDate()) || null;
    trialData.task = { id: firestoreTrial.taskId };
    trialData.variant = { id: firestoreTrial.variantId };
    trialData.district = { id: firestoreTrial.districtId };
    trialData.school = { id: firestoreTrial.schoolId };
    trialData.class = { id: firestoreTrial.classId };
    trialData.group = { id: firestoreTrial.groupId };

    delete firestoreTrial.taskId;
    delete firestoreTrial.variantId;
    delete firestoreTrial.districtId;
    delete firestoreTrial.schoolId;
    delete firestoreTrial.classId;
    delete firestoreTrial.groupId;
    delete firestoreTrial.timeStarted;
    delete firestoreTrial.timeFinished;

    trials.push({
      ...trialData,
      ...(firestoreTrial as ITrial),
    });
  });
};

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
