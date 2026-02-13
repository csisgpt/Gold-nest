import { NotImplementedException, NotFoundException } from '@nestjs/common';
import { promises as fs, createReadStream } from 'fs';
import * as path from 'path';
import { ApiErrorCode } from '../../../common/http/api-error-codes';
import { StorageObjectStream, StorageProvider } from './storage.provider';

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly uploadRoot: string) {}

  private getAbsolutePath(key: string): string {
    return path.join(this.uploadRoot, key);
  }

  async putObject(key: string, body: Buffer, _contentType: string): Promise<void> {
    const absolutePath = this.getAbsolutePath(key);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, body);
  }

  async getObjectStream(key: string): Promise<StorageObjectStream> {
    const absolutePath = this.getAbsolutePath(key);
    const stats = await fs.stat(absolutePath).catch(() => null);
    if (!stats) {
      throw new NotFoundException({ code: ApiErrorCode.FILE_NOT_FOUND, message: 'File not found' });
    }
    const stream = createReadStream(absolutePath);
    return { stream, contentLength: stats.size };
  }

  async deleteObject(key: string): Promise<void> {
    const absolutePath = this.getAbsolutePath(key);
    await fs.rm(absolutePath, { force: true });
  }

  async getPresignedGetUrl(): Promise<string> {
    throw new NotImplementedException({ code: ApiErrorCode.FILE_READ_FAILED, message: 'Presigned URLs are not supported for local storage' });
  }
}
