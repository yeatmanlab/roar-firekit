import { initializeApp, getApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  setPersistence,
} from 'firebase/auth';
import { connectFirestoreEmulator, Firestore, getFirestore } from 'firebase/firestore';
import { Functions, connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import _chunk from 'lodash/chunk';
import _difference from 'lodash/difference';
import _get from 'lodash/get';
import _isEmpty from 'lodash/isEmpty';
import _isEqual from 'lodash/isEqual';
import _isPlainObject from 'lodash/isPlainObject';
import _mergeWith from 'lodash/mergeWith';
import _remove from 'lodash/remove';
import _union from 'lodash/union';
import { markRaw } from 'vue';
import { str as crc32 } from 'crc-32';
import { IOrgLists, OrgListKey } from './interfaces';

/** Remove null attributes from an object
 * @function
 * @param {Object} obj - Object to remove null attributes from
 * @returns {Object} Object with null attributes removed
 */
export const removeNull = (obj: object): object => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== null));
};

/** Remove undefined attributes from an object
 * @function
 * @param {Object} obj - Object to remove undefined attributes from
 * @returns {Object} Object with undefined attributes removed
 */
export const removeUndefined = (obj: object): object => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
};

/** Recursively replace values in an object
 * @function
 * @param {Object} obj - Object to recursively replace values in
 * @param {unknown} valueToReplace - Value to replace
 * @param {unknown} replacementValue - Replacement value
 * @returns {Object} Object with values recursively replaced
 */
export const replaceValues = (
  obj: { [key: string]: unknown },
  valueToReplace: unknown = undefined,
  replacementValue: unknown = null,
): { [key: string]: unknown } => {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => {
      if (_isPlainObject(value)) {
        return [key, replaceValues(value as { [key: string]: unknown }, valueToReplace, replacementValue)];
      }
      return [key, value === valueToReplace ? replacementValue : value];
    }),
  );
};

export interface CommonFirebaseConfig {
  projectId: string;
  apiKey: string;
}

export interface EmulatorConfigData extends CommonFirebaseConfig {
  emulatorPorts: {
    db: number;
    auth: number;
    functions: number;
  };
}

export interface RealConfigData extends CommonFirebaseConfig {
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export type FirebaseConfigData = RealConfigData | EmulatorConfigData;

export const safeInitializeApp = (config: RealConfigData, name: string) => {
  try {
    const app = getApp(name);
    if (!_isEqual(app.options, config)) {
      throw new Error(`There is an existing firebase app named ${name} with different configuration options.`);
    }
    return app;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.code === 'app/no-app') {
      return initializeApp(config, name);
    } else {
      throw error;
    }
  }
};

export enum AuthPersistence {
  local = 'local',
  session = 'session',
  none = 'none',
}

export interface MarkRawConfig {
  auth?: boolean;
  db?: boolean;
  functions?: boolean;
}

type FirebaseProduct = Auth | Firestore | Functions;

export const initializeFirebaseProject = async (
  config: FirebaseConfigData,
  name: string,
  authPersistence = AuthPersistence.session,
  markRawConfig: MarkRawConfig = {},
) => {
  const optionallyMarkRaw = <T extends FirebaseProduct>(productKey: string, productInstance: T): T => {
    if (_get(markRawConfig, productKey)) {
      return markRaw(productInstance);
    } else {
      return productInstance;
    }
  };

  if ((config as EmulatorConfigData).emulatorPorts) {
    const app = initializeApp({ projectId: config.projectId, apiKey: config.apiKey }, name);
    const ports = (config as EmulatorConfigData).emulatorPorts;
    const auth = optionallyMarkRaw('auth', getAuth(app));
    const db = optionallyMarkRaw('db', getFirestore(app));
    const functions = optionallyMarkRaw('functions', getFunctions(app));

    connectFirestoreEmulator(db, '127.0.0.1', ports.db);
    connectFunctionsEmulator(functions, '127.0.0.1', ports.functions);

    const originalInfo = console.info;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    console.info = () => {};
    connectAuthEmulator(auth, `http://127.0.0.1:${ports.auth}`);
    console.info = originalInfo;

    return {
      firebaseApp: app,
      auth,
      db,
      functions,
    };
  } else {
    const app = safeInitializeApp(config as RealConfigData, name);
    const kit = {
      firebaseApp: app,
      auth: optionallyMarkRaw('auth', getAuth(app)),
      db: optionallyMarkRaw('db', getFirestore(app)),
      functions: optionallyMarkRaw('functions', getFunctions(app)),
    };

    // Auth state persistence is set with ``setPersistence`` and specifies how a
    // user session is persisted on a device. We choose in session persistence by
    // default because many students will access the ROAR on shared devices in the
    // classroom.
    if (authPersistence === AuthPersistence.session) {
      await setPersistence(kit.auth, browserSessionPersistence);
    } else if (authPersistence === AuthPersistence.local) {
      await setPersistence(kit.auth, browserLocalPersistence);
    } else if (authPersistence === AuthPersistence.none) {
      await setPersistence(kit.auth, inMemoryPersistence);
    }

    return kit;
  }
};

/** Get unique entries from a single id string and an array of id strings
 *
 * @function
 * @param {string} id - a single id string
 * @param {string[]} idArray - an array of id strings
 * @returns {string[]} the merged array of unique ids
 */
export const mergeIds = (id: string | undefined, idArray: string[] | undefined) => {
  const resultIds: string[] = [];
  if (id) resultIds.push(id);
  if (idArray && idArray.length) resultIds.push(...idArray);

  return [...new Set(resultIds)];
};

export interface IUserDocument {
  districtId?: string;
  schoolId?: string;
  schools?: string[];
  classId?: string;
  classes?: string[];
  groupId?: string;
  groups?: string[];
}

export const getOrgs = (docData: IUserDocument) => {
  const { districtId, schoolId, schools, classId, classes, groupId, groups } = docData;
  const districtIds = mergeIds(districtId, undefined);
  const schoolIds = mergeIds(schoolId, schools);
  const classIds = mergeIds(classId, classes);
  const groupIds = mergeIds(groupId, groups);

  return {
    districtIds,
    schoolIds,
    classIds,
    groupIds,
  };
};

export const userHasSelectedOrgs = (usersOrgs: string[], selectedOrgs: string[]) => {
  // If the selected org list is empty, assume that the user wants all users
  if (selectedOrgs.length === 0) {
    return true;
  }
  return Boolean(usersOrgs.filter((value) => selectedOrgs.includes(value)).length);
};

export const emptyOrg = () => {
  return {
    current: [],
    all: [],
    dates: {},
  };
};

export const emptyOrgList = (): IOrgLists => {
  return {
    districts: [],
    schools: [],
    classes: [],
    groups: [],
    families: [],
  };
};

export const waitFor = (conditionFunction: () => boolean) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poll = (resolve: any) => {
    if (conditionFunction()) resolve();
    else setTimeout(() => poll(resolve), 300);
  };

  return new Promise(poll);
};

/**
 * Merge new game parameters with old parameters with constraints
 *
 * The constraints are:
 * - no new parameters may be added,
 * - no old parameters may be removed,
 * - any parameters that have been changed must have had ``null`` values in ``oldParams``
 *
 * @param oldParams - Old game parameters
 * @param newParams - New game parameters
 * @returns merged game parameters
 */
export const mergeGameParams = (oldParams: { [key: string]: unknown }, newParams: { [key: string]: unknown }) => {
  const customizer = (oldValue: unknown, newValue: unknown, key: string) => {
    if (oldValue === null) {
      return newValue;
    }
    if (_isEqual(oldValue, newValue)) {
      return newValue;
    }
    if (oldValue === undefined && newValue !== undefined) {
      throw new Error(`New key detected: ${key}`);
    } else {
      throw new Error(`Attempted to change previously non-null value with key ${key}`);
    }
  };

  const merged = _mergeWith({ ...oldParams }, newParams, customizer);
  const differentKeys = _difference(Object.keys(merged), Object.keys(newParams));
  if (!_isEmpty(differentKeys)) {
    throw new Error(`Detected deleted keys: ${differentKeys.join(', ')}`);
  }
  return merged;
};

export const crc32String = (inputString: string) => {
  const modulo = (a: number, b: number) => {
    return a - Math.floor(a / b) * b;
  };

  const toUint32 = (x: number) => {
    return modulo(x, Math.pow(2, 32));
  };

  return toUint32(crc32(inputString)).toString(16);
};

interface IMap {
  id: string;
  [key: string]: unknown;
}

interface IOrgMaps {
  districts?: IMap[];
  schools?: IMap[];
  classes?: IMap[];
  groups?: IMap[];
  families?: IMap[];
}

interface ITreeTableEntry {
  key: string;
  data: IMap;
  children?: ITreeTableEntry[];
}

const treeTableFormat = (orgs: IMap[], orgType: string, startIndex = 0) => {
  return orgs.map((element, index) => ({
    key: (index + startIndex).toString(),
    data: {
      ...element,
      orgType,
    },
  })) as ITreeTableEntry[];
};

export const getTreeTableOrgs = (inputOrgs: IOrgMaps) => {
  const { districts = [], schools = [], classes = [], groups = [], families = [] } = inputOrgs;

  const ttDistricts = treeTableFormat(districts, 'district');
  const ttSchools = treeTableFormat(schools, 'school');
  const ttClasses = treeTableFormat(classes, 'class');

  let topLevelOrgs: ITreeTableEntry[] = [];

  if (districts.length) {
    topLevelOrgs = ttDistricts;
    for (const _school of ttSchools) {
      const districtId = _school.data.districtId;
      const districtIndex = topLevelOrgs.findIndex((district) => district.data.id === districtId);

      // This will return all classes for this school and also remove them from the classes array.
      // At the end, we will add any left over classes as orphaned classes
      const classesForThisSchool = _remove(ttClasses, (c) => c.data.schoolId === _school.data.id);

      if (districtIndex !== -1) {
        const _district = topLevelOrgs[districtIndex];
        if (_district.children === undefined) {
          topLevelOrgs[districtIndex].children = [
            {
              ..._school,
              key: `${_district.key}-0`,
              // This next pattern is a bit funky. It conditionally adds a children field
              // but only if there are any classes for this school.
              ...(classesForThisSchool.length > 0 && {
                children: classesForThisSchool.map((element, index) => ({
                  key: `${_district.key}-0-${index}`,
                  data: element.data,
                })),
              }),
            },
          ];
        } else {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          topLevelOrgs[districtIndex].children!.push({
            ..._school,
            key: `${_district.key}-${_district.children.length}`,
            ...(classesForThisSchool.length > 0 && {
              children: classesForThisSchool.map((element, index) => ({
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                key: `${_district.key}-${_district.children!.length}-${index}`,
                data: element.data,
              })),
            }),
          });
        }
      } else {
        topLevelOrgs.push({
          ..._school,
          key: `${topLevelOrgs.length}`,
          ...(classesForThisSchool.length > 0 && {
            children: classesForThisSchool.map((element, index) => ({
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              key: `${topLevelOrgs.length}-${index}`,
              data: element.data,
            })),
          }),
        });
      }
    }

    // We have now gone through all of the schools and removed any classes that
    // belong to the supplied schools. If there are any schools left, they
    // should either be direct descendants of a district (rare) or they should
    // be at the top level.
    for (const _class of ttClasses) {
      const districtId = _class.data.districtId;
      const districtIndex = topLevelOrgs.findIndex((district) => district.data.id === districtId);
      if (districtIndex !== -1) {
        // Add this class as a direct descendant of the district
        const _district = topLevelOrgs[districtIndex];
        if (_district.children === undefined) {
          topLevelOrgs[districtIndex].children = [
            {
              key: `${_district.key}-0`,
              data: _class.data,
            },
          ];
        } else {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          topLevelOrgs[districtIndex].children!.push({
            key: `${_district.key}-${_district.children.length}`,
            data: _class.data,
          });
        }
      } else {
        // Add this class to the top-level orgs
        topLevelOrgs.push({
          key: `${topLevelOrgs.length}`,
          data: _class.data,
        });
      }
    }
  } else if (schools.length) {
    topLevelOrgs = ttSchools;
    for (const _class of ttClasses) {
      const schoolId = _class.data.schoolId;
      const schoolIndex = topLevelOrgs.findIndex((school) => school.data.id === schoolId);
      if (schoolIndex !== -1) {
        const _school = topLevelOrgs[schoolIndex];
        if (_school.children === undefined) {
          topLevelOrgs[schoolIndex].children = [
            {
              ..._class,
              key: `${_school.key}-0`,
            },
          ];
        } else {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          topLevelOrgs[schoolIndex].children!.push({
            ..._class,
            key: `${_school.key}-${_school.children.length}`,
          });
        }
      } else {
        topLevelOrgs.push({
          ..._class,
          key: `${topLevelOrgs.length}`,
        });
      }
    }
  } else if (classes.length) {
    topLevelOrgs = ttClasses;
  }

  const ttGroups = treeTableFormat(groups, 'group', topLevelOrgs.length);
  topLevelOrgs.push(...ttGroups);

  const ttFamilies = treeTableFormat(families, 'family', topLevelOrgs.length);
  topLevelOrgs.push(...ttFamilies);

  return topLevelOrgs;
};

export const chunkOrgLists = ({ orgs, chunkSize = 30 }: { orgs?: IOrgLists; chunkSize: number }) => {
  if (!orgs) return [undefined];

  const allOrgs: string[] = _union(...Object.values(orgs));
  if (allOrgs.length <= chunkSize) return [orgs];

  const chunkedOrgs = _chunk(allOrgs, chunkSize);
  return chunkedOrgs.map((chunk) => {
    const orgChunk = emptyOrgList();
    for (const org of chunk) {
      for (const orgType in orgChunk) {
        orgChunk[orgType as OrgListKey].push(org);
      }
    }

    return orgChunk;
  });
};
