import { promises as fs, createReadStream } from 'fs';
import * as path from 'path';
import { StorageObjectStream, StorageProvider } from './storage.provider';

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly uploadRoot: string) {}

  private getAbsolutePath(key: string): string {
    return path.join(this.uploadRoot, key);
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    const absolutePath = this.getAbsolutePath(key);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, body);
  }

  async getObjectStream(key: string): Promise<StorageObjectStream> {
    const absolutePath = this.getAbsolutePath(key);
    const stats = await fs.stat(absolutePath).catch(() => null);
    if (!stats) {
      throw new Error('NOT_FOUND');
    }
    const stream = createReadStream(absolutePath);
    return { stream, contentLength: stats.size };
  }

  async deleteObject(key: string): Promise<void> {
    const absolutePath = this.getAbsolutePath(key);
    await fs.rm(absolutePath, { force: true });
  }
}
