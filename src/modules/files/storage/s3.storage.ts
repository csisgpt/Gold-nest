import { Readable } from 'stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { StorageObjectStream, StorageProvider } from './storage.provider';

export class S3StorageProvider implements StorageProvider {
  private readonly client: any;

  constructor(
    private readonly bucket: string,
    options: {
      endpoint?: string;
      region?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
    },
  ) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region ?? 'default',
      credentials:
        options.accessKeyId && options.secretAccessKey
          ? {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            }
          : undefined,
      forcePathStyle: true,
    });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getObjectStream(key: string): Promise<StorageObjectStream> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!result.Body) {
      throw new Error('NOT_FOUND');
    }

    let stream: Readable;
    if (result.Body instanceof Readable) {
      stream = result.Body;
    } else if (typeof (result.Body as any).transformToWebStream === 'function') {
      stream = Readable.fromWeb((result.Body as any).transformToWebStream());
    } else {
      stream = Readable.from(result.Body as any);
    }

    return {
      stream,
      contentLength: result.ContentLength ?? undefined,
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
