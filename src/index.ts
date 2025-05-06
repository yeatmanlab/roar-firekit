import { RoarFirekit } from './firekit';
import configService from './config';
import { AuthPersistence } from './firestore/util';
import { RoarConfig } from './interfaces';

export { RoarFirekit } from './firekit';
export { RoarAppkit } from './firestore/app/appkit';
export { RoarAppUser } from './firestore/app/user';
export { RoarTaskVariant } from './firestore/app/task';
export { emptyOrg, emptyOrgList, getTreeTableOrgs, initializeFirebaseProject, AuthPersistence } from './firestore/util';
export * from './firestore/query-assessment';

export function createFirekit({
  useEmulators = false,
  emulatorHost = 'localhost',
  authPersistence = AuthPersistence.session,
  verboseLogging = false,
  customConfig = null
}: {
  useEmulators?: boolean;
  emulatorHost?: string;
  authPersistence?: AuthPersistence;
  verboseLogging?: boolean;
  customConfig?: RoarConfig | null;
} = {}) {
  // Force emulator configuration if useEmulators is true
  if (useEmulators && typeof process !== 'undefined') {
    process.env.USE_FIREBASE_EMULATORS = 'true';
    if (emulatorHost) {
      process.env.FIREBASE_EMULATOR_HOST = emulatorHost;
    }
  }

  // Use provided custom config or get from config service
  const roarConfig = customConfig || configService;

  // Create firekit instance with the config
  const firekit = new RoarFirekit({
    roarConfig,
    verboseLogging,
    authPersistence,
    dbPersistence: true,
    markRawConfig: {},
    listenerUpdateCallback: () => {}
  });

  return firekit.init();
}

export default RoarFirekit;
