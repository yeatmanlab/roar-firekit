/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, MockInstance } from 'vitest';
import { RoarAppkit } from '../../firestore/app/appkit';
import { BUCKET_URLS } from '../../constants/bucket-urls';
import { UploadStatusEnum } from '../../constants/upload-status';
// Mock Firebase modules before importing RoarAppkit
vi.mock('firebase/storage', async () => {
  return {
    ref: vi.fn((storage, path) => ({
      path,
      toString: () => `${storage.bucket}/${path}`,
    })),
    getDownloadURL: vi.fn(),
    uploadBytesResumable: vi.fn(() => ({
      on: vi.fn((event, progress, error, complete) => {
        if (complete) complete();
      }),
    })),
    getStorage: vi.fn((app, bucketUrl) => ({ app, bucket: bucketUrl })),
  };
});

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
      projectId: 'gse-roar-assessment-dev',
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

  // Apply any overrides
  Object.entries(overrides).forEach(([key, value]) => {
    (appkit as any)[key] = value;
  });

  return appkit;
}

describe('uploadFileOrBlobToStorage', () => {
  let appkit: RoarAppkit;
  let processQueueSpy: MockInstance;

  beforeEach(() => {
    vi.restoreAllMocks();
    appkit = createMockAppkit({
      user: mockUser,
      run: mockRun,
      firebaseProject: mockFirebaseProject,
      _assignmentId: 'assignment-123',
    });
    processQueueSpy = vi.spyOn(appkit as any, 'processUploadQueue');
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

  it('returns a storage target URL and adds task to upload queue', async () => {
    // Force the queue to pause
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    processQueueSpy.mockImplementationOnce(() => {});
    const result = await appkit.uploadFileOrBlobToStorage({
      filename: 'test.webm',
      fileOrBlob: new Blob(['test']),
      customMetadata: {
        test: 'test',
      },
    });

    expect(result).toBe(
      `${BUCKET_URLS.gseRoarAssessmentDev}/test-task-id/test-uid-123/test-pid-456/assignment-123/test-run-id/test.webm`,
    );
    expect((appkit as any)._uploadQueue.length).toBe(1);
  });

  it('ignores app-provided assessmentPid if user has assessmentPid', async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    processQueueSpy.mockImplementationOnce(() => {});
    const result = await appkit.uploadFileOrBlobToStorage({
      filename: 'test.webm',
      fileOrBlob: new Blob(['test']),
      customMetadata: {
        test: 'test',
      },
      assessmentPid: 'test-pid-input',
    });

    expect(result).toBe(
      `${BUCKET_URLS.gseRoarAssessmentDev}/test-task-id/test-uid-123/test-pid-456/assignment-123/test-run-id/test.webm`,
    );
  });

  it('sets assessmentPid to app-provided assessmentPid if user does not have assessmentPid', async () => {
    const localAppKit = createMockAppkit({
      user: mockUserWithoutPid,
      run: mockRun,
      firebaseProject: mockFirebaseProject,
      _assignmentId: 'assignment-123',
    });

    const localProcessQueueSpy = vi.spyOn(localAppKit as any, 'processUploadQueue');

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    localProcessQueueSpy.mockImplementationOnce(() => {});
    const result = await localAppKit.uploadFileOrBlobToStorage({
      filename: 'test.webm',
      fileOrBlob: new Blob(['test']),
      customMetadata: {
        test: 'test',
      },
      assessmentPid: 'test-pid-input',
    });

    expect(result).toBe(
      `${BUCKET_URLS.gseRoarAssessmentDev}/test-task-id/test-uid-123/test-pid-input/assignment-123/test-run-id/test.webm`,
    );
  });

  it('sets assessmentPid to assessmentUid if assessmentPid is not provided by user or app', async () => {
    const localAppKit = createMockAppkit({
      user: mockUserWithoutPid,
      run: mockRun,
      firebaseProject: mockFirebaseProject,
      _assignmentId: 'assignment-123',
    });

    const localProcessQueueSpy = vi.spyOn(localAppKit as any, 'processUploadQueue');

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    localProcessQueueSpy.mockImplementationOnce(() => {});
    const result = await localAppKit.uploadFileOrBlobToStorage({
      filename: 'test.webm',
      fileOrBlob: new Blob(['test']),
      customMetadata: {
        test: 'test',
      },
    });

    expect(result).toBe(
      `${BUCKET_URLS.gseRoarAssessmentDev}/test-task-id/test-uid-123/test-uid-123/assignment-123/test-run-id/test.webm`,
    );
  });

  it('sanitizes filename with periods and slashes', async () => {
    const result = await appkit.uploadFileOrBlobToStorage({
      filename: './../../etc/passwd?.mp3',
      fileOrBlob: new Blob(['test']),
    });

    expect(result).toBe(
      `${BUCKET_URLS.gseRoarAssessmentDev}/test-task-id/test-uid-123/test-pid-456/assignment-123/test-run-id/etcpasswd.mp3`,
    );
  });

  it('sanitizes filename with carriage returns and line feeds', async () => {
    const result = await appkit.uploadFileOrBlobToStorage({
      filename: '.\r\n..\r\nbad[file]*.php.ogg',
      fileOrBlob: new Blob(['test']),
    });

    expect(result).toBe(
      `${BUCKET_URLS.gseRoarAssessmentDev}/test-task-id/test-uid-123/test-pid-456/assignment-123/test-run-id/badfile.php.ogg`,
    );
  });

  it('sanitizes filename with special characters', async () => {
    const result = await appkit.uploadFileOrBlobToStorage({
      filename: '.\\..\\b=ad&[file]*.php.wav',
      fileOrBlob: new Blob(['test']),
    });

    expect(result).toBe(
      `${BUCKET_URLS.gseRoarAssessmentDev}/test-task-id/test-uid-123/test-pid-456/assignment-123/test-run-id/badfile.php.wav`,
    );
  });

  it('sanitizes filename with consecutive periods', async () => {
    const result = await appkit.uploadFileOrBlobToStorage({
      filename: '/var/log/....app?debug#1.webm',
      fileOrBlob: new Blob(['test']),
    });

    expect(result).toBe(
      `${BUCKET_URLS.gseRoarAssessmentDev}/test-task-id/test-uid-123/test-pid-456/assignment-123/test-run-id/varlogappdebug1.webm`,
    );
  });

  it('rejects filename with incompatible file extension', async () => {
    await expect(() =>
      appkit.uploadFileOrBlobToStorage({
        filename: '/var/log/.app?debug#1.txt',
        fileOrBlob: new Blob(['test']),
      }),
    ).rejects.toThrow('Unsupported file type: ".txt". Allowed: .webm, .mp4, .wav, .ogg, .mkv, .mp3');
  });

  it('sanitizes assessmentPid and keeps dashes', async () => {
    const localAppKit = createMockAppkit({
      user: mockUserWithoutPid,
      run: mockRun,
      firebaseProject: mockFirebaseProject,
      _assignmentId: 'assignment-123',
    });

    const result = await localAppKit.uploadFileOrBlobToStorage({
      filename: 'x.wav',
      fileOrBlob: new Blob(['test']),
      assessmentPid: '//.x-a-s.ss',
    });

    expect(result).toBe(
      `${BUCKET_URLS.gseRoarAssessmentDev}/test-task-id/test-uid-123/x-a-s.ss/assignment-123/test-run-id/x.wav`,
    );
  });

  it('sanitizes assessmentPid and throws error if empty', async () => {
    const localAppKit = createMockAppkit({
      user: mockUserWithoutPid,
      run: mockRun,
      firebaseProject: mockFirebaseProject,
      _assignmentId: 'assignment-123',
    });

    await expect(() =>
      localAppKit.uploadFileOrBlobToStorage({
        filename: 'x.wav',
        fileOrBlob: new Blob(['test']),
        assessmentPid: './##..\\',
      }),
    ).rejects.toThrow('Input must be at least 1 character long after sanitization.');
  });

  it('sanitizes filename and truncates to 1024 characters if original filename is longer', async () => {
    const result = await appkit.uploadFileOrBlobToStorage({
      filename: '/\\/?/...' + 'a'.repeat(1030) + '\n.mp4',
      fileOrBlob: new Blob(['test']),
    });
    const newFilename = result.split('/').pop();
    expect(newFilename?.length).toBe(1024);
  });

  it('adds multiple tasks and processes them in order', async () => {
    // Force the queue to pause
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    processQueueSpy.mockImplementation(() => {});

    await appkit.uploadFileOrBlobToStorage({
      filename: 'test.webm',
      fileOrBlob: new Blob(['test']),
    });
    await appkit.uploadFileOrBlobToStorage({
      filename: 'test1.webm',
      fileOrBlob: new Blob(['test1']),
    });
    await appkit.uploadFileOrBlobToStorage({
      filename: 'test2.webm',
      fileOrBlob: new Blob(['test2']),
    });

    expect((appkit as any)._uploadQueue.length).toBe(3);

    // Restore the processQueueSpy to allow the queue to process
    processQueueSpy.mockRestore();

    await appkit.uploadFileOrBlobToStorage({
      filename: 'test3.webm',
      fileOrBlob: new Blob(['test3']),
    });

    // All tasks should be processed and removed from the queue
    expect((appkit as any)._uploadQueue.length).toBe(0);
  });

  // Although completed/failed tasks are removed, this tests that tasks are processed based on status
  it('only processes pending tasks, ignoring completed or failed tasks', async () => {
    // Force the queue to not run so we can verify the task was added to the queue
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    processQueueSpy.mockImplementation(() => {});

    await appkit.uploadFileOrBlobToStorage({
      filename: 'test.webm',
      fileOrBlob: new Blob(['test']),
    });
    await appkit.uploadFileOrBlobToStorage({
      filename: 'test1.webm',
      fileOrBlob: new Blob(['test1']),
    });
    await appkit.uploadFileOrBlobToStorage({
      filename: 'test3.webm',
      fileOrBlob: new Blob(['test3']),
    });

    (appkit as any)._uploadQueue[0].status = UploadStatusEnum.COMPLETED;
    (appkit as any)._uploadQueue[2].status = UploadStatusEnum.FAILED;

    expect((appkit as any)._uploadQueue.length).toBe(3);

    // Restore the processQueueSpy to allow the queue to process
    processQueueSpy.mockRestore();

    await appkit.uploadFileOrBlobToStorage({
      filename: 'test4.webm',
      fileOrBlob: new Blob(['test4']),
    });

    // Only the pending task should be processed and removed from the queue
    expect((appkit as any)._uploadQueue.length).toBe(2);
  });

  it('does not process more than 3 concurrent uploads', async () => {
    // Force the queue to not run so we can verify the task was added to the queue
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    processQueueSpy.mockImplementation(() => {});

    await appkit.uploadFileOrBlobToStorage({
      filename: 'test.webm',
      fileOrBlob: new Blob(['test']),
    });
    await appkit.uploadFileOrBlobToStorage({
      filename: 'test1.webm',
      fileOrBlob: new Blob(['test1']),
    });
    await appkit.uploadFileOrBlobToStorage({
      filename: 'test3.webm',
      fileOrBlob: new Blob(['test3']),
    });

    (appkit as any)._uploadQueue[0].status = UploadStatusEnum.UPLOADING;
    (appkit as any)._uploadQueue[1].status = UploadStatusEnum.UPLOADING;
    (appkit as any)._uploadQueue[2].status = UploadStatusEnum.UPLOADING;

    expect((appkit as any)._uploadQueue.length).toBe(3);

    // Restore the processQueueSpy to allow the queue to process
    processQueueSpy.mockRestore();

    await appkit.uploadFileOrBlobToStorage({
      filename: 'test4.webm',
      fileOrBlob: new Blob(['test4']),
    });

    // All tasks should remain in queue
    expect((appkit as any)._uploadQueue.length).toBe(4);
    // The fourth task should remain pending since max concurrent uploads is 3
    expect((appkit as any)._uploadQueue[3].status).toBe(UploadStatusEnum.PENDING);
  });
});
