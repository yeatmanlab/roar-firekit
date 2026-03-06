/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RoarAppkit } from '../../firestore/app/appkit';

// Mock Firebase modules before importing RoarAppkit
vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({
    toString: () => 'gs://test-bucket/test-path',
  })),
  getDownloadURL: vi.fn(),
  uploadBytesResumable: vi.fn(() => ({
    on: vi.fn((event, progress, error, complete) => {
      if (complete) complete();
    }),
  })),
  getStorage: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}));

// Mock user and run data
const mockUser = {
  assessmentUid: 'test-uid-123',
  assessmentPid: 'test-pid-456',
};

const mockUserWithoutPid = {
  assessmentUid: 'test-uid-123',
};

const mockRun = {
  task: {
    taskId: 'test-task-id',
  },
  runRef: {
    id: 'test-run-id',
  },
};

const mockFirebaseProject = {
  firebaseApp: {
    options: {
      projectId: 'roar-assessment-dev',
    },
  },
  auth: {},
};

/**
 * Helper to create a RoarAppkit instance with mocked internal state.
 * Uses the real class but sets up the necessary properties for testing.
 */
function createMockAppkit(overrides: Record<string, any> = {}): RoarAppkit {
  const appkit = new RoarAppkit({
    firebaseProject: mockFirebaseProject as any,
    userInfo: { assessmentUid: 'test-uid' } as any,
    taskInfo: { taskId: 'test-task' } as any,
  });

  // Set default test state
  (appkit as any)._initialized = true;
  (appkit as any)._authenticated = true;
  (appkit as any)._uploadQueue = [];
  (appkit as any)._isQueueRunning = false;

  // Apply any overrides
  Object.entries(overrides).forEach(([key, value]) => {
    (appkit as any)[key] = value;
  });

  return appkit;
}

describe('generateFilePath', () => {
  let appkit: RoarAppkit;

  beforeEach(() => {
    appkit = createMockAppkit();
  });

  it('throws error when user is not authenticated', () => {
    (appkit as any)._authenticated = false;
    expect(() => appkit.generateFilePath({ taskId: 'task-1', filename: 'test.webm' })).toThrow(
      'User must be authenticated to generate file path.',
    );
  });

  it('generates correct file path with user assessmentPid', () => {
    (appkit as any).user = mockUser;
    (appkit as any).run = mockRun;
    (appkit as any)._assignmentId = 'assignment-123';

    const result = appkit.generateFilePath({ taskId: 'task-1', filename: 'recording.webm' });

    expect(result).toBe('task-1/test-uid-123/test-pid-456/assignment-123/test-run-id/recording.webm');
  });

  it('uses provided assessmentPid when user has no assessmentPid', () => {
    (appkit as any).user = mockUserWithoutPid;
    (appkit as any).run = mockRun;
    (appkit as any)._assignmentId = 'assignment-123';

    const result = appkit.generateFilePath({
      taskId: 'task-1',
      filename: 'recording.webm',
      assessmentPid: 'provided-pid',
    });

    expect(result).toBe('task-1/test-uid-123/provided-pid/assignment-123/test-run-id/recording.webm');
  });

  it('falls back to assessmentUid when no pid is available', () => {
    (appkit as any).user = mockUserWithoutPid;
    (appkit as any).run = mockRun;
    (appkit as any)._assignmentId = 'assignment-123';

    const result = appkit.generateFilePath({ taskId: 'task-1', filename: 'recording.webm' });

    expect(result).toBe('task-1/test-uid-123/test-uid-123/assignment-123/test-run-id/recording.webm');
  });

  it('uses guest-administration when no assignmentId is provided', () => {
    (appkit as any).user = mockUser;
    (appkit as any).run = mockRun;
    (appkit as any)._assignmentId = undefined;

    const result = appkit.generateFilePath({ taskId: 'task-1', filename: 'recording.webm' });

    expect(result).toBe('task-1/test-uid-123/test-pid-456/guest-administration/test-run-id/recording.webm');
  });
});

describe('uploadFileOrBlobToStorage', () => {
  let appkit: RoarAppkit;

  beforeEach(() => {
    appkit = createMockAppkit({
      user: mockUser,
      run: mockRun,
      firebaseProject: mockFirebaseProject,
      _assignmentId: 'assignment-123',
    });
  });

  it('throws error when user is not authenticated', async () => {
    (appkit as any)._authenticated = false;

    await expect(
      appkit.uploadFileOrBlobToStorage({
        filename: 'test.webm',
        fileOrBlob: new Blob(['test']),
      }),
    ).rejects.toThrow('User must be authenticated to upload files to storage.');
  });

  it('throws error when no active run exists', async () => {
    (appkit as any).run = null;

    await expect(
      appkit.uploadFileOrBlobToStorage({
        filename: 'test.webm',
        fileOrBlob: new Blob(['test']),
      }),
    ).rejects.toThrow('No active run found.');
  });

  it('throws error when filename is missing', async () => {
    await expect(
      appkit.uploadFileOrBlobToStorage({
        filename: '',
        fileOrBlob: new Blob(['test']),
      }),
    ).rejects.toThrow('filename, and file/blob are required');
  });

  it('throws error when fileOrBlob is missing', async () => {
    await expect(
      appkit.uploadFileOrBlobToStorage({
        filename: 'test.webm',
        fileOrBlob: null as any,
      }),
    ).rejects.toThrow('filename, and file/blob are required');
  });

  it('adds task to upload queue and returns storage URL', async () => {
    const result = await appkit.uploadFileOrBlobToStorage({
      filename: 'test.webm',
      fileOrBlob: new Blob(['test']),
    });

    expect(result).toBe('gs://test-bucket/test-path');
  });

  it('accepts custom metadata', async () => {
    const result = await appkit.uploadFileOrBlobToStorage({
      filename: 'test.webm',
      fileOrBlob: new Blob(['test']),
      customMetadata: { key: 'value' },
    });

    expect(result).toBe('gs://test-bucket/test-path');
  });
});

describe('processUploadQueue', () => {
  let appkit: RoarAppkit;

  beforeEach(() => {
    appkit = createMockAppkit();
  });

  it('does nothing when queue is already running', () => {
    (appkit as any)._isQueueRunning = true;
    (appkit as any)._uploadQueue = [{ status: 'pending' }];

    appkit.processUploadQueue();

    // Queue should remain unchanged
    expect((appkit as any)._uploadQueue[0].status).toBe('pending');
  });

  it('does nothing when no pending tasks exist', () => {
    (appkit as any)._isQueueRunning = false;
    (appkit as any)._uploadQueue = [{ status: 'completed' }];

    appkit.processUploadQueue();

    expect((appkit as any)._isQueueRunning).toBe(false);
  });

  it('processes pending task and sets status to uploading', () => {
    const mockUploadTask = {
      on: vi.fn(),
    };

    (appkit as any)._isQueueRunning = false;
    (appkit as any)._uploadQueue = [
      {
        status: 'pending',
        filename: 'test.webm',
        upload: () => mockUploadTask,
      },
    ];

    appkit.processUploadQueue();

    expect((appkit as any)._isQueueRunning).toBe(true);
    expect((appkit as any)._uploadQueue[0].status).toBe('uploading');
    expect(mockUploadTask.on).toHaveBeenCalledWith(
      'state_changed',
      undefined,
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('removes task from queue on successful completion', () => {
    let completeCallback: (() => void) | undefined;
    const mockUploadTask = {
      on: vi.fn((event, progress, error, complete) => {
        completeCallback = complete;
      }),
    };

    (appkit as any)._isQueueRunning = false;
    (appkit as any)._uploadQueue = [
      {
        status: 'pending',
        filename: 'test.webm',
        upload: () => mockUploadTask,
      },
    ];

    appkit.processUploadQueue();

    // Simulate completion
    if (completeCallback) completeCallback();

    expect((appkit as any)._uploadQueue.length).toBe(0);
    expect((appkit as any)._isQueueRunning).toBe(false);
  });

  it('removes task from queue on error', () => {
    let errorCallback: ((error: { code: string }) => void) | undefined;
    const mockUploadTask = {
      on: vi.fn((event, progress, error, _) => {
        errorCallback = error;
      }),
    };

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      return void 0;
    });

    (appkit as any)._isQueueRunning = false;
    (appkit as any)._uploadQueue = [
      {
        status: 'pending',
        filename: 'test.webm',
        upload: () => mockUploadTask,
      },
    ];

    appkit.processUploadQueue();

    // Simulate error
    if (errorCallback) errorCallback({ code: 'storage/unauthorized' });

    expect((appkit as any)._uploadQueue.length).toBe(0);
    expect((appkit as any)._isQueueRunning).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith('Upload error: test.webm [storage/unauthorized]');

    consoleSpy.mockRestore();
  });

  it('processes next task after current task completes', () => {
    let completeCallback: (() => void) | undefined;
    const mockUploadTask1 = {
      on: vi.fn((event, progress, error, complete) => {
        completeCallback = complete;
      }),
    };
    const mockUploadTask2 = {
      on: vi.fn(),
    };

    (appkit as any)._isQueueRunning = false;
    (appkit as any)._uploadQueue = [
      {
        status: 'pending',
        filename: 'test1.webm',
        upload: () => mockUploadTask1,
      },
      {
        status: 'pending',
        filename: 'test2.webm',
        upload: () => mockUploadTask2,
      },
    ];

    appkit.processUploadQueue();

    // First task should be processing
    expect((appkit as any)._uploadQueue[0].status).toBe('uploading');
    expect((appkit as any)._uploadQueue[1].status).toBe('pending');

    // Complete first task
    if (completeCallback) completeCallback();

    // Second task should now be processing
    expect((appkit as any)._uploadQueue.length).toBe(1);
    expect((appkit as any)._uploadQueue[0].status).toBe('uploading');
    expect(mockUploadTask2.on).toHaveBeenCalled();
  });
});
