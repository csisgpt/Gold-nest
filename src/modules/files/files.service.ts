import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttachmentEntityType, PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FilesService {
  private readonly uploadRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.uploadRoot = configService.get<string>('UPLOAD_ROOT') || 'uploads';
  }

  getAbsolutePath(storageKey: string) {
    return path.join(this.uploadRoot, storageKey);
  }

  async storeFile(
    file: Express.Multer.File,
    uploadedById: string,
    label?: string,
  ) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dir = path.join(this.uploadRoot, `${year}`, `${month}`, `${day}`);
    await fs.mkdir(dir, { recursive: true });

    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const fileName = `${now.getTime()}_${safeName}`;
    const destination = path.join(dir, fileName);
    await fs.writeFile(destination, file.buffer);

    const storageKey = path.relative(this.uploadRoot, destination);

    return this.prisma.file.create({
      data: {
        uploadedById,
        storageKey,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        label,
      },
    });
  }

  async getFile(fileId: string) {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return file;
  }

  async createAttachments(
    fileIds: string[] | undefined,
    entityType: AttachmentEntityType,
    entityId: string,
    tx?: PrismaClient,
  ) {
    if (!fileIds || fileIds.length === 0) return [];
    const client = tx ?? this.prisma;
    return client.attachment.createMany({
      data: fileIds.map((fileId) => ({ fileId, entityType, entityId })),
    });
  }
}
