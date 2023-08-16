import { Firestore, collection, getCountFromServer, getDocs, or, query, where } from 'firebase/firestore';
import { IUserData } from './interfaces';

interface IUserQueryInput {
  db: Firestore;
  districts: string[];
  schools: string[];
  classes: string[];
  studies: string[];
  families: string[];
}

export const buildUserQueryForAdminDb = ({
  db,
  districts = [],
  schools = [],
  classes = [],
  studies = [],
  families = [],
}: IUserQueryInput) => {
  const userCollectionRef = collection(db, 'users');
  const orgQueryParams: ReturnType<typeof where>[] = [];
  if (districts) orgQueryParams.push(where('districts', 'array-contains', districts));
  if (schools) orgQueryParams.push(where('schools', 'array-contains', schools));
  if (classes) orgQueryParams.push(where('classes', 'array-contains', classes));
  if (studies) orgQueryParams.push(where('studies', 'array-contains', studies));
  if (families) orgQueryParams.push(where('families', 'array-contains', families));

  if (orgQueryParams.length === 0) return undefined;

  return query(userCollectionRef, or(...orgQueryParams));
};

export const countUsersInAdminDb = async ({ db, districts, schools, classes, studies, families }: IUserQueryInput) => {
  const userQuery = buildUserQueryForAdminDb({ db, districts, schools, classes, studies, families });
  if (userQuery) {
    const snapshot = await getCountFromServer(userQuery);
    return snapshot.data().count;
  } else {
    return 0;
  }
};

export const getUsersInAdminDb = async ({ db, districts, schools, classes, studies, families }: IUserQueryInput) => {
  const userQuery = buildUserQueryForAdminDb({ db, districts, schools, classes, studies, families });
  if (userQuery) {
    const snapshot = await getDocs(userQuery);
    const users: IUserData[] = [];
    snapshot.forEach((doc) => {
      users.push(doc.data() as IUserData);
    });
    return users;
  } else {
    return [];
  }
};
