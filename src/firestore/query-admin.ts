import { Firestore, collection, doc, getCountFromServer, getDoc, getDocs, or, query, where } from 'firebase/firestore';
import { IAdministrationData, IOrgLists, IUserData } from './interfaces';
import { chunkOrgLists, emptyOrgList } from './util';
import _union from 'lodash/union';
import _uniqBy from 'lodash/uniqBy';

interface IGetterInput {
  db: Firestore;
  orgs?: IOrgLists;
  isSuperAdmin: boolean;
  includeStats?: boolean;
}

interface IQueryInput extends IGetterInput {
  collectionName: string;
  nested: boolean;
}

export const buildQueryForAdminCollection = ({
  db,
  collectionName,
  nested,
  isSuperAdmin = false,
  orgs = emptyOrgList(),
}: IQueryInput) => {
  const collectionRef = collection(db, collectionName);

  if (isSuperAdmin) return query(collectionRef);

  // Cloud Firestore limits a query to a maximum of 30 disjunctions in disjunctive normal form.
  // Detect if there are too many `array-contains` comparisons
  if (_union(...Object.values(orgs)).length > 30) {
    throw new Error('Too many orgs to query. Please chunk orgs such that the total number of orgs is less than 30.');
  }

  const orgQueryParams: ReturnType<typeof where>[] = [];

  if (nested) {
    if (orgs.districts.length) orgQueryParams.push(where('districts.current', 'array-contains', orgs.districts));
    if (orgs.schools.length) orgQueryParams.push(where('schools.current', 'array-contains', orgs.schools));
    if (orgs.classes.length) orgQueryParams.push(where('classes.current', 'array-contains', orgs.classes));
    if (orgs.groups.length) orgQueryParams.push(where('groups.current', 'array-contains', orgs.groups));
    if (orgs.families.length) orgQueryParams.push(where('families.current', 'array-contains', orgs.families));
  } else {
    if (orgs.districts.length) orgQueryParams.push(where('districts', 'array-contains', orgs.districts));
    if (orgs.schools.length) orgQueryParams.push(where('schools', 'array-contains', orgs.schools));
    if (orgs.classes.length) orgQueryParams.push(where('classes', 'array-contains', orgs.classes));
    if (orgs.groups.length) orgQueryParams.push(where('groups', 'array-contains', orgs.groups));
    if (orgs.families.length) orgQueryParams.push(where('families', 'array-contains', orgs.families));
  }

  if (orgQueryParams.length === 0) return undefined;

  return query(collectionRef, or(...orgQueryParams));
};

export const countUsersInAdminDb = async ({ db, orgs = emptyOrgList(), isSuperAdmin = false }: IGetterInput) => {
  const userQuery = buildQueryForAdminCollection({
    db,
    collectionName: 'users',
    nested: true,
    isSuperAdmin,
    orgs: orgs,
  });
  if (userQuery) {
    const snapshot = await getCountFromServer(userQuery);
    return snapshot.data().count;
  } else {
    return 0;
  }
};

export const getUsersInAdminDb = async ({ db, orgs, isSuperAdmin = false }: IGetterInput) => {
  // const chunkedOrgs = chunkOrgLists(orgs, 20);
  // const users: IUserData[] = [];

  const userQuery = buildQueryForAdminCollection({
    db,
    collectionName: 'users',
    nested: true,
    isSuperAdmin,
    orgs,
  });
  if (userQuery) {
    const snapshot = await getDocs(userQuery);
    const users: IUserData[] = [];
    snapshot.forEach((docSnap) => {
      users.push(docSnap.data() as IUserData);
    });
    return users;
  } else {
    return [];
  }
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
    const query = buildQueryForAdminCollection({
      db,
      collectionName: 'administrations',
      nested: false,
      orgs: orgsChunk,
      isSuperAdmin,
    });

    if (query) {
      const snapshot = await getDocs(query);
      const administrationsChunk: IAdministrationData[] = [];
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
      administrations.push(...administrationsChunk);
    }
  }

  return _uniqBy(administrations, (a: IAdministrationData) => a.id);
};
