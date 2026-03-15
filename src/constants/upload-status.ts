export const UploadStatusEnum = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type UploadStatus = typeof UploadStatusEnum[keyof typeof UploadStatusEnum];
