import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApiErrorCode } from '../../../common/http/api-error-codes';
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
      throw new NotFoundException({ code: ApiErrorCode.FILE_NOT_FOUND, message: 'File not found' });
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
    disposition?: 'inline' | 'attachment';
  }): Promise<string> {
    const disposition = params.disposition ?? 'attachment';
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ResponseContentDisposition: params.fileName
        ? `${disposition}; filename="${encodeURIComponent(params.fileName)}"`
        : disposition,
      ResponseContentType: params.contentType,
    });

    return getSignedUrl(this.client, command, { expiresIn: params.expiresInSeconds });
  }
}
