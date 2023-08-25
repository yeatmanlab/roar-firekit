import {
  Firestore,
  and,
  collection,
  collectionGroup,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  or,
  query,
  where,
} from 'firebase/firestore';
import { IAdministrationData, IAssignmentData, IOrgLists, IUserData } from './interfaces';
import { chunkOrgLists, emptyOrgList } from './util';
import _union from 'lodash/union';
import _uniqBy from 'lodash/uniqBy';
import { getRunById } from './query-assessment';

interface IGetterInput {
  db: Firestore;
  assessmentDb?: Firestore;
  orgs?: IOrgLists;
  isSuperAdmin?: boolean;
  includeStats?: boolean;
}

interface IGetUsersInput extends IGetterInput {
  assignmentId?: string;
  countOnly?: boolean;
  includeScores?: boolean;
}

interface IQueryInput extends IGetterInput {
  collectionName: string;
  nested: boolean;
}

export const buildQueryByOrgs = ({ db, collectionName, nested, isSuperAdmin = false, orgs }: IQueryInput) => {
  const collectionRef = collection(db, collectionName);

  if (!orgs) {
    if (isSuperAdmin) return query(collectionRef);
    throw new Error('Orgs are required if user is not a super admin');
  }

  // Cloud Firestore limits a query to a maximum of 30 disjunctions in disjunctive normal form.
  // Detect if there are too many `array-contains` comparisons
  if (_union(...Object.values(orgs)).length > 30) {
    throw new Error('Too many orgs to query. Please chunk orgs such that the total number of orgs is less than 30.');
  }

  const orgQueryParams: ReturnType<typeof where>[] = [];

  if (nested) {
    if (orgs.districts?.length) orgQueryParams.push(where('districts.current', 'array-contains-any', orgs.districts));
    if (orgs.schools?.length) orgQueryParams.push(where('schools.current', 'array-contains-any', orgs.schools));
    if (orgs.classes?.length) orgQueryParams.push(where('classes.current', 'array-contains-any', orgs.classes));
    if (orgs.groups?.length) orgQueryParams.push(where('groups.current', 'array-contains-any', orgs.groups));
    if (orgs.families?.length) orgQueryParams.push(where('families.current', 'array-contains-any', orgs.families));
  } else {
    if (orgs.districts?.length) orgQueryParams.push(where('districts', 'array-contains-any', orgs.districts));
    if (orgs.schools?.length) orgQueryParams.push(where('schools', 'array-contains-any', orgs.schools));
    if (orgs.classes?.length) orgQueryParams.push(where('classes', 'array-contains-any', orgs.classes));
    if (orgs.groups?.length) orgQueryParams.push(where('groups', 'array-contains-any', orgs.groups));
    if (orgs.families?.length) orgQueryParams.push(where('families', 'array-contains-any', orgs.families));
  }

  if (orgQueryParams.length === 0) return undefined;

  return query(collectionRef, or(...orgQueryParams));
};

export const buildQueryByAssignment = ({ db, assignmentId, orgs }: IGetUsersInput) => {
  const collectionRef = collectionGroup(db, 'assignments');
  const assignmentIdQuery = where(documentId(), '==', assignmentId);

  if (orgs) {
    // Cloud Firestore limits a query to a maximum of 30 disjunctions in disjunctive normal form.
    // We cap it at 25 so that we can combine with the assignment ID query as well.
    // Detect if there are too many `array-contains` comparisons
    if (_union(...Object.values(orgs)).length > 25) {
      throw new Error('Too many orgs to query. Please chunk orgs such that the total number of orgs is less than 30.');
    }

    const orgQueryParams: ReturnType<typeof where>[] = [];

    if (orgs.districts.length)
      orgQueryParams.push(where('assigningOrgs.districts', 'array-contains-any', orgs.districts));
    if (orgs.schools.length) orgQueryParams.push(where('assigningOrgs.schools', 'array-contains-any', orgs.schools));
    if (orgs.classes.length) orgQueryParams.push(where('assigningOrgs.classes', 'array-contains-any', orgs.classes));
    if (orgs.groups.length) orgQueryParams.push(where('assigningOrgs.groups', 'array-contains-any', orgs.groups));
    if (orgs.families.length) orgQueryParams.push(where('assigningOrgs.families', 'array-contains-any', orgs.families));

    if (orgQueryParams.length === 0) {
      return undefined;
    }

    return query(collectionRef, and(assignmentIdQuery, or(...orgQueryParams)));
  } else {
    return query(collectionRef, assignmentIdQuery);
  }
};

export const getUsersByOrgs = async ({
  db,
  orgs = emptyOrgList(),
  isSuperAdmin = false,
  countOnly = false,
}: IGetUsersInput) => {
  const chunkedOrgs = chunkOrgLists(orgs, 20);
  let total = 0;
  const users: IUserData[] = [];

  for (const orgsChunk of chunkedOrgs) {
    const userQuery = buildQueryByOrgs({
      db,
      collectionName: 'users',
      nested: true,
      isSuperAdmin,
      orgs: orgsChunk,
    });

    if (userQuery) {
      if (countOnly) {
        const snapshot = await getCountFromServer(userQuery);
        total += snapshot.data().count;
      } else {
        const snapshot = await getDocs(userQuery);
        snapshot.forEach((docSnap) => {
          users.push({
            id: docSnap.id,
            ...docSnap.data(),
          } as IUserData);
        });
      }
    }
  }

  if (countOnly) return total;
  return _uniqBy(users, (u: IUserData) => u.id);
};

export const getAdministrations = async ({
  db,
  orgs = emptyOrgList(),
  isSuperAdmin = false,
  includeStats = true,
}: IGetterInput) => {
  const chunkedOrgs = chunkOrgLists(orgs, 20);

  const administrations: IAdministrationData[] = [];

  for (const orgsChunk of chunkedOrgs) {
    const q = buildQueryByOrgs({
      db,
      collectionName: 'administrations',
      nested: false,
      orgs: orgsChunk,
      isSuperAdmin,
    });

    if (q) {
      const snapshot = await getDocs(q);
      for (const docSnap of snapshot.docs) {
        const docData = docSnap.data();
        if (includeStats) {
          const completionDocRef = doc(docSnap.ref, 'stats', 'completion');
          const completionDocSnap = await getDoc(completionDocRef);
          if (completionDocSnap.exists()) {
            docData.stats = completionDocSnap.data();
          }
        }
        administrations.push({
          id: docSnap.id,
          ...docData,
        } as IAdministrationData);
      }
    }
  }

  return _uniqBy(administrations, (a: IAdministrationData) => a.id);
};

export interface IUserAssignmentData {
  id: string;
  user: IUserData;
  assignment: IAssignmentData;
}

export const getUsersByAssignment = async ({
  db,
  assessmentDb,
  assignmentId,
  orgs = emptyOrgList(),
  countOnly = false,
  includeScores = false,
}: IGetUsersInput) => {
  if (includeScores && !assessmentDb) {
    throw new Error('You must provide an assessmentDb if you want to include scores.');
  }

  let total = 0;
  const assignments: IUserAssignmentData[] = [];

  if (orgs) {
    const chunkedOrgs = chunkOrgLists(orgs, 20);

    for (const orgsChunk of chunkedOrgs) {
      const q = buildQueryByAssignment({
        db,
        assignmentId,
        orgs: orgsChunk,
      });

      if (q) {
        if (countOnly) {
          const snapshot = await getCountFromServer(q);
          total += snapshot.data().count;
        } else {
          const snapshot = await getDocs(q);
          for (const docSnap of snapshot.docs) {
            const assignmentData = docSnap.data() as IAssignmentData;

            if (includeScores) {
              // To retrieve scores, we first build an object where the keys are
              // the task IDs of each assessment and the values are the scores
              // for the run associated with that assessment.
              const assessments = assignmentData.assessments;
              const scores: { [key: string]: unknown } = {};
              for (const assessment of assessments) {
                const runId = assessment.runId;
                if (runId) {
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  const { runScores } = await getRunById({ db: assessmentDb!, runId });
                  scores[assessment.taskId] = runScores;
                }
              }

              // Now we iterate over the scores and insert them into the
              // assessments array of objects.
              for (const [taskId, score] of Object.entries(scores)) {
                const assessmentIdx = assessments.findIndex((a) => a.taskId === taskId);
                const oldAssessmentInfo = assessments[assessmentIdx];
                const newAssessmentInfo = {
                  ...oldAssessmentInfo,
                  scores: score,
                };
                assessments[assessmentIdx] = newAssessmentInfo;
              }
              assignmentData.assessments = assessments;
            }

            // Now grab the user document and add it to the results.
            const userRef = docSnap.ref.parent.parent;
            if (userRef) {
              const userDocSnap = await getDoc(userRef);
              if (userDocSnap.exists()) {
                assignments.push({
                  id: userDocSnap.id,
                  user: userDocSnap.data() as IUserData,
                  assignment: assignmentData,
                });
              }
            }
          }
        }
      }
    }
  }

  if (countOnly) return total;
  return _uniqBy(assignments, (u: IUserAssignmentData) => u.id);
};
