import {
  DocumentData,
  Firestore,
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  or,
  query,
  where,
} from 'firebase/firestore';
import { IAdministrationData, IOrgLists, IUserData, OrgCollectionName } from './interfaces';
import { chunkOrgLists, emptyOrgList } from './util';
import _chunk from 'lodash/chunk';
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

export const getOrganizations = async (db: Firestore, orgType: OrgCollectionName, orgIds?: string[]) => {
  let q: ReturnType<typeof query>;
  if (!orgIds) {
    q = query(collection(db, orgType));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const docData = doc.data() as DocumentData;
      docData.id = doc.id;
      return docData;
    });
  }

  const orgs = [];
  const maxQueryDisjunctions = 20;
  for (const _orgsChunk of _chunk(orgIds, maxQueryDisjunctions)) {
    q = query(collection(db, orgType), where(documentId(), 'in', _orgsChunk));
    const snapshot = await getDocs(q);
    orgs.push(
      ...snapshot.docs.map((doc) => {
        const docData = doc.data() as DocumentData;
        docData.id = doc.id;
        return docData;
      }),
    );
  }

  return orgs;
};

export const isOrgAvailable = async (
  db: Firestore,
  collectionName: string,
  orgName: string,
  orgAbbreviation: string,
) => {
  const q = query(
    collection(db, collectionName),
    where('name', '==', orgName),
    where('abbreviation', '==', orgAbbreviation),
  );
  const snapshot = await getCountFromServer(q);
  return snapshot.data().count === 0;
};

export const isDistrictAvailable = async (db: Firestore, districtName: string, districtAbbreviation: string) => {
  return isOrgAvailable(db, 'districts', districtName, districtAbbreviation);
};

export const isSchoolAvailableInDistrict = async (
  db: Firestore,
  districtId: string,
  schoolName: string,
  schoolAbbreviation: string,
) => {
  const q = query(
    collection(db, 'schools'),
    where('name', '==', schoolName),
    where('abbreviation', '==', schoolAbbreviation),
    where('districtId', '==', districtId),
  );
  const snapshot = await getCountFromServer(q);
  return snapshot.data().count === 0;
};

export const isGroupAvailable = async (db: Firestore, groupName: string, groupAbbreviation: string) => {
  return isOrgAvailable(db, 'groups', groupName, groupAbbreviation);
};
