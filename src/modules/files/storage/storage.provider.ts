import { Readable } from 'stream';

export interface StorageObjectStream {
  stream: Readable;
  contentLength?: number;
}

export interface StorageProvider {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObjectStream(key: string): Promise<StorageObjectStream>;
  deleteObject?(key: string): Promise<void>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
