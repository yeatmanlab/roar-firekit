/*
  Taken from: https://gist.github.com/nfarina/90ba99a5187113900c86289e67586aaa
  Quick & Dirty Google Cloud Storage emulator for tests. Requires
  `stream-buffers` from npm. Use it like this:
  `new MockStorage().bucket('my-bucket').file('my_file').createWriteStream()`
*/
import * as fs from 'fs';
import * as path from 'path';
import streamBuffers from 'stream-buffers';
import type { CreateWriteStreamOptions, GetSignedUrlConfig } from '@google-cloud/storage';

export class MockStorage {
  public buckets: object;

  public constructor() {
    this.buckets = {};
  }

  public bucket(name: string): MockBucket {
    if (this.buckets[name] === undefined) {
      this.buckets[name] = new MockBucket(name);
    }
    return this.buckets[name];
  }
}

export class MockBucket {
  public name: string;

  public files: object;

  public constructor(name: string) {
    this.name = name;
    this.files = {};
  }

  public upload(name: string, options: any): MockFile[] {
    return [this.file(name)];
  }

  public file(name: string): MockFile {
    if (this.files[name] === undefined) {
      this.files[name] = new MockFile(name);
    }
    return this.files[name];
  }
}

interface Metadata {
  metadata?: object;
}

export class MockFile {
  public name: string;

  public path?: string;

  public contents: Buffer;

  public metadata: {
    metadata?: object;
  };

  public constructor(name: string, path?: string) {
    this.name = name;
    this.path = path;
    this.contents = Buffer.alloc(0);
    this.metadata = {};
  }

  public download(): any {
    // download returns a buffer array where the data is stored in the first element
    const filePath = path.resolve(__dirname, this.name);
    const buffer = fs.readFileSync(filePath);
    return [buffer];
  }

  public get(): [MockFile, any] {
    return [this, this.metadata];
  }

  public async delete(): Promise<void> {
    return Promise.resolve();
  }

  public exists(): [boolean, any] {
    return [true, this.metadata];
  }

  public setMetadata(metadata: Metadata): void {
    const customMetadata = { ...this.metadata.metadata, ...metadata.metadata };
    this.metadata = { ...this.metadata, ...metadata, metadata: customMetadata };
  }

  public async getSignedUrl(options?: GetSignedUrlConfig): Promise<string> {
    return Promise.resolve('https://example.com');
  }

  public createReadStream(): any {
    const readable = new streamBuffers.ReadableStreamBuffer();
    readable.put(this.contents);
    readable.stop();
    return readable;
  }

  public createWriteStream(options?: CreateWriteStreamOptions): any {
    const writable = new streamBuffers.WritableStreamBuffer();
    writable.on('finish', () => {
      this.contents = writable.getContents();
    });
    return writable;
  }
}
