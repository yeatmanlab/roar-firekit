import {
  DocumentReference,
  Firestore,
  Query,
  Timestamp,
  collection,
  doc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { RoarFirekit } from './firekit';
import { getOrgs, UserDocument, userHasSelectedOrgs } from './util';

export const getRootDocs = async (firekit: RoarFirekit) => {
  if (firekit.app) {
    const result: { [x: string]: unknown } = {};
    const prodDoc = doc(firekit.app.db, 'prod', 'roar-prod');
    result[prodDoc.path] = prodDoc;

    const devQuery = query(collection(firekit.app.db, 'dev'));
    const devSnapshot = await getDocs(devQuery);
    devSnapshot.forEach((doc) => {
      result[doc.ref.path] = doc;
    });

    const extQuery = query(collection(firekit.app.db, 'external'));
    const extSnapshot = await getDocs(extQuery);
    extSnapshot.forEach((doc) => {
      result[doc.ref.path] = doc;
    });

    return {
      rootDocs: result,
      prodDoc: prodDoc,
    };
  } else {
    throw new Error('firekit.app is not initialized');
  }
};

interface ITask {
  id: string;
  name: string;
}

export const getTasks = async (rootDoc: DocumentReference) => {
  const taskQuery = query(collection(rootDoc, 'tasks'));
  const tasksSnapshot = await getDocs(taskQuery);
  const tasks: ITask[] = [];
  tasksSnapshot.forEach((doc) => {
    tasks.push({
      id: doc.id,
      name: doc.data().name,
    });
  });
  return tasks;
};

interface IVariant {
  id: string;
  name: string;
  nameId: string;
}

interface ITaskVariants {
  task: string;
  items: IVariant[];
}

export const getTasksVariants = async (rootDoc: DocumentReference) => {
  const variants: ITaskVariants[] = [];

  const tasks = await getTasks(rootDoc);
  for (const task of tasks) {
    const variantQuery = query(collection(rootDoc, 'tasks', task.id, 'variants'));
    const variantsSnapshot = await getDocs(variantQuery);

    const items: IVariant[] = [];
    variantsSnapshot.forEach((doc) => {
      if (doc.id !== 'empty') {
        items.push({
          id: doc.id,
          name: doc.data().name,
          nameId: `${doc.data().name}-${doc.id}`,
        });
      }
    });

    variants.push({
      task: task.id,
      items,
    });
  }

  return variants;
};

interface IUser {
  roarUid: string;
  districts: string[];
  schools: string[];
  groups: string[];
  classes: string[];
}

export interface IUserQueryInput {
  db: Firestore;
  districts: string[];
  schools: string[];
  classes: string[];
  groups: string[];
  families: string[];
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
      const { districtIds, schoolIds, groupIds, classIds } = getOrgs(doc.data() as UserDocument);

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
