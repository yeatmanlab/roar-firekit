/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { readConfig } from '../configReader';

describe('configReader', () => {
  it('reads a roarconfig.json file', () => {
    const config = readConfig('roarconfig.test.json');
    expect(config!.firebaseConfig.apiKey).toBe('roarApiKey');
    expect(config!.firebaseConfig.authDomain).toBe('roarAuthDomain');
    expect(config!.firebaseConfig.projectId).toBe('roarProjectId');
    expect(config!.firebaseConfig.storageBucket).toBe('roarStorageBucket');
    expect(config!.firebaseConfig.messagingSenderId).toBe('roarMessagingSenderId');
    expect(config!.firebaseConfig.appId).toBe('roarAppId');
    expect(config!.firebaseConfig.measurementId).toBe('roarMeasurementId');
    expect(config!.rootDoc).toStrictEqual(['roarCollection', 'roarDoc']);
  });
});
