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
  emulatorPorts = {
    db: undefined,
    auth: undefined,
    functions: undefined
  },
  authPersistence = AuthPersistence.session,
  verboseLogging = false,
  customConfig = null
}: {
  useEmulators?: boolean;
  emulatorHost?: string;
  emulatorPorts?: {
    db?: number;
    auth?: number;
    functions?: number;
  };
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
    // Set emulator port environment variables if provided
    if (emulatorPorts.db) {
      process.env.FIREBASE_FIRESTORE_EMULATOR_PORT = emulatorPorts.db.toString();
    }
    if (emulatorPorts.auth) {
      process.env.FIREBASE_AUTH_EMULATOR_PORT = emulatorPorts.auth.toString();
    }
    if (emulatorPorts.functions) {
      process.env.FIREBASE_FUNCTIONS_EMULATOR_PORT = emulatorPorts.functions.toString();
    }
  }

  // Use provided custom config or get from config service
  const roarConfig = customConfig || configService;

  // If we have a custom config and emulator ports, add them to the config
  if (useEmulators && roarConfig && 'admin' in roarConfig && 'app' in roarConfig) {
    const typedConfig = roarConfig as RoarConfig;
    // Add emulator configuration to both admin and app configs
    if (typedConfig.admin) {
      typedConfig.admin.useEmulators = true;
      typedConfig.admin.emulatorHost = emulatorHost;
      if (!('emulatorPorts' in typedConfig.admin)) {
        (typedConfig.admin as any).emulatorPorts = {};
      }
      // Only set if provided (preserve existing config values)
      if (emulatorPorts.db) (typedConfig.admin as any).emulatorPorts.db = emulatorPorts.db;
      if (emulatorPorts.auth) (typedConfig.admin as any).emulatorPorts.auth = emulatorPorts.auth;
      if (emulatorPorts.functions) (typedConfig.admin as any).emulatorPorts.functions = emulatorPorts.functions;
    }
    
    if (typedConfig.app) {
      typedConfig.app.useEmulators = true;
      typedConfig.app.emulatorHost = emulatorHost;
      if (!('emulatorPorts' in typedConfig.app)) {
        (typedConfig.app as any).emulatorPorts = {};
      }
      // Only set if provided (preserve existing config values)
      if (emulatorPorts.db) (typedConfig.app as any).emulatorPorts.db = emulatorPorts.db;
      if (emulatorPorts.auth) (typedConfig.app as any).emulatorPorts.auth = emulatorPorts.auth;
      if (emulatorPorts.functions) (typedConfig.app as any).emulatorPorts.functions = emulatorPorts.functions;
    }
  }

  // Create firekit instance with the config
  const firekit = new RoarFirekit({
    roarConfig: roarConfig as RoarConfig,
    verboseLogging,
    authPersistence,
    dbPersistence: true,
    markRawConfig: {},
    listenerUpdateCallback: () => {}
  });

  return firekit.init();
}

export default RoarFirekit;
