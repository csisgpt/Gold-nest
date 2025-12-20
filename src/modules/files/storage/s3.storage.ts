import { Readable } from 'stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageObjectStream, StorageProvider } from './storage.provider';

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: {
      endpoint?: string;
      region?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      forcePathStyle?: boolean;
    },
  ) {
    const endpoint = options.endpoint
      ? /^https?:\/\//i.test(options.endpoint)
        ? options.endpoint
        : `https://${options.endpoint}`
      : undefined;

    this.client = new S3Client({
      endpoint,
      region: options.region ?? 'default',
      credentials:
        options.accessKeyId && options.secretAccessKey
          ? {
            accessKeyId: options.accessKeyId,
            secretAccessKey: options.secretAccessKey,
          }
          : undefined,
    });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (e: any) {
      console.error('[S3 PUT ERROR]', {
        name: e?.name,
        message: e?.message,
        code: e?.Code,
        status: e?.$metadata?.httpStatusCode,
        requestId: e?.$metadata?.requestId,
        cfId: e?.$metadata?.cfId,
      });
      throw e; // مهم: حتماً throw کن
    }
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

  async getPresignedGetUrl(params: {
    key: string;
    expiresInSeconds: number;
    fileName?: string;
    contentType?: string;
  }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ResponseContentDisposition: params.fileName
        ? `attachment; filename="${encodeURIComponent(params.fileName)}"`
        : undefined,
      ResponseContentType: params.contentType,
    });

    return getSignedUrl(this.client, command, { expiresIn: params.expiresInSeconds });
  }
}
