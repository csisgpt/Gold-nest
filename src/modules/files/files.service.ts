import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  AttachmentEntityType,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import * as path from 'path';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import {
  STORAGE_PROVIDER,
  StorageObjectStream,
  StorageProvider,
} from './storage/storage.provider';


@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async storeFile(
    file: Express.Multer.File,
    uploadedById: string,
    label?: string,
  ) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const fileName = `${now.getTime()}_${safeName}`;
    const storageKey = path.posix.join(`${year}`, `${month}`, `${day}`, fileName);
    await this.storage.putObject(storageKey, file.buffer, file.mimetype);

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

  async getFileAuthorized(fileId: string, actor: JwtRequestUser) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { attachments: true },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (actor?.role === UserRole.ADMIN) return file;
    if (file.uploadedById === actor?.id) return file;

    if (file.attachments.length === 0) {
      throw new ForbiddenException('You do not have access to this file');
    }

    const isLinked = await this.isActorOwnerOfAttachmentEntities(
      file.attachments,
      actor.id,
    );

    if (!isLinked) {
      throw new ForbiddenException('You do not have access to this file');
    }

    return file;
  }

  async getFileStream(storageKey: string): Promise<StorageObjectStream> {
    try {
      return await this.storage.getObjectStream(storageKey);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === 'NOT_FOUND' || err.name === 'NoSuchKey' || err.name === 'NotFound')
      ) {
        throw new NotFoundException('Stored file not found');
      }
      throw err;
    }
  }

  async createAttachmentsForActor(
    actor: { id: string; role?: UserRole },
    fileIds: string[] | undefined,
    entityType: AttachmentEntityType,
    entityId: string,
    tx?: PrismaClient,
  ) {
    if (!fileIds || fileIds.length === 0) return [];
    const client = tx ?? this.prisma;

    const files = await client.file.findMany({ where: { id: { in: fileIds } } });
    if (files.length !== fileIds.length) {
      throw new BadRequestException('Some files not found');
    }

    if (actor.role !== UserRole.ADMIN) {
      const unauthorized = files.find((f) => f.uploadedById !== actor.id);
      if (unauthorized) {
        throw new ForbiddenException('Cannot attach files you do not own');
      }
    }

    return client.attachment.createMany({
      data: fileIds.map((fileId) => ({ fileId, entityType, entityId })),
    });
  }

  private async isActorOwnerOfAttachmentEntities(
    attachments: { entityType: AttachmentEntityType; entityId: string }[],
    actorId: string,
  ): Promise<boolean> {
    const idsByType = attachments.reduce<Record<AttachmentEntityType, string[]>>(
      (acc, att) => {
        acc[att.entityType] = acc[att.entityType] ?? [];
        acc[att.entityType].push(att.entityId);
        return acc;
      },
      {} as Record<AttachmentEntityType, string[]>,
    );

    if (idsByType[AttachmentEntityType.DEPOSIT]?.length) {
      const deposits = await this.prisma.depositRequest.findMany({
        where: { id: { in: idsByType[AttachmentEntityType.DEPOSIT] } },
        select: { id: true, userId: true },
      });
      if (deposits.some((d) => d.userId === actorId)) return true;
    }

    if (idsByType[AttachmentEntityType.WITHDRAW]?.length) {
      const withdrawals = await this.prisma.withdrawRequest.findMany({
        where: { id: { in: idsByType[AttachmentEntityType.WITHDRAW] } },
        select: { id: true, userId: true },
      });
      if (withdrawals.some((w) => w.userId === actorId)) return true;
    }

    if (idsByType[AttachmentEntityType.TRADE]?.length) {
      const trades = await this.prisma.trade.findMany({
        where: { id: { in: idsByType[AttachmentEntityType.TRADE] } },
        select: { id: true, clientId: true },
      });
      if (trades.some((t) => t.clientId === actorId)) return true;
    }

    if (idsByType[AttachmentEntityType.GOLD_LOT]?.length) {
      const lots = await this.prisma.goldLot.findMany({
        where: { id: { in: idsByType[AttachmentEntityType.GOLD_LOT] } },
        select: { id: true, userId: true },
      });
      if (lots.some((g) => g.userId === actorId)) return true;
    }

    if (idsByType[AttachmentEntityType.REMITTANCE]?.length) {
      const remittances = await this.prisma.remittance.findMany({
        where: { id: { in: idsByType[AttachmentEntityType.REMITTANCE] } },
        select: {
          id: true,
          fromUserId: true,
          toUserId: true,
          group: { select: { createdByUserId: true } },
        },
      });
      if (
        remittances.some(
          (r) =>
            r.fromUserId === actorId ||
            r.toUserId === actorId ||
            r.group?.createdByUserId === actorId,
        )
      ) {
        return true;
      }
    }

    return false;
  }

}
