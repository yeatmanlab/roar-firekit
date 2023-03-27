import { backOff, IBackOffOptions } from 'exponential-backoff';
import { Storage, UploadResponse } from '@google-cloud/storage';
import { FIREBASE_COLLECTIONS, YEATMAN_LAB_BUCKET } from './config';
import { logger } from 'firebase-functions/v2';

export class QueryCloudStorage {
  private bucket;
  private bucketName = YEATMAN_LAB_BUCKET; // to export csv data

  constructor() {
    this.bucket = new Storage().bucket(this.bucketName); // to access bucket in gcp
  }

  // uploads a local file to a Google cloud bucket
  public async uploadFile(localFilePath: string, cloudFilePath: string) {
    logger.debug(`Uploading local file ${localFilePath}
      to GCP bucket ${this.bucketName} at path ${cloudFilePath}...`);

    // upload local file to bucket
    try {
      const response: UploadResponse = await backOff(
        () => this.bucket.upload(localFilePath, { destination: cloudFilePath }),
        <IBackOffOptions>{ numOfAttempts: 3 },
      );
      logger.debug(`File uploaded to path: ${response[0].publicUrl()}`);
      logger.debug('File uploaded successfully!');
    } catch (err: unknown) {
      logger.error('File upload failed.');
      logger.error(`Local file path: ${localFilePath}, Cloud file path: ${cloudFilePath}.`);
      if (err instanceof Error) {
        logger.error('Error message:', err.message);
      }
    }
  }

  public async readFile(filePath: string) {
    logger.debug(`Reading file from GCP bucket ${this.bucketName} at path ${filePath}...`);
    const buffer = await this.bucket.file(filePath).download();
    const data = buffer[0].toString('utf8');
    logger.debug('File read successfully!');
    return data;
  }

  public async listLabs() {
    const labs: Set<string> = new Set<string>();

    for (const firebaseCollection of FIREBASE_COLLECTIONS) {
      // Lists files in the bucket, filtered by a prefix
      const [files] = await this.bucket.getFiles({
        prefix: firebaseCollection,
      });

      for (const file of files) {
        labs.add(file.name.split('/').slice(0, 2).join('/'));
      }
    }

    return labs;
  }
}
