/* eslint-disable @typescript-eslint/no-explicit-any */
import { RoarAppkit } from '../../firestore/app/appkit';

const mockFirebaseProject = {
  firebaseApp: {
    options: {
      projectId: 'gse-roar-assessment-dev',
    },
  },
  auth: {},
};

/**
 * Helper to create a RoarAppkit instance with mocked internal state.
 * Uses the real class but sets up the necessary properties for testing.
 */
export const createMockAppkit = (overrides: Record<string, any> = {}): RoarAppkit => {
  const appkit = new RoarAppkit({
    firebaseProject: mockFirebaseProject as any,
    userInfo: { assessmentUid: 'test-uid' } as any,
    taskInfo: { taskId: 'test-task' } as any,
  });

  // Set default test state
  (appkit as any)._initialized = true;
  (appkit as any)._authenticated = true;
  (appkit as any)._uploadQueue = [];

  // Apply any overrides
  Object.entries(overrides).forEach(([key, value]) => {
    (appkit as any)[key] = value;
  });

  return appkit;
};
