import { AttachmentEntityType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toUserMinimalDto, toUserSafeDto } from '../../common/mappers/user.mapper';
import { userMinimalSelect, userSafeSelect } from '../../common/prisma/selects/user.select';
import { AdminDepositDetailDto, AdminDepositAttachmentDto, AdminDepositAccountTxDto } from './dto/response/admin-deposit-detail.dto';

export const adminDepositSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  amount: true,
  method: true,
  status: true,
  refNo: true,
  note: true,
  processedAt: true,
  processedById: true,
  accountTxId: true,
  user: { select: userSafeSelect },
  processedBy: { select: userMinimalSelect },
  accountTx: {
    select: {
      id: true,
      createdAt: true,
      accountId: true,
      type: true,
      refType: true,
      refId: true,
      delta: true,
      account: {
        select: {
          id: true,
          instrument: { select: { id: true, code: true, name: true, unit: true } },
        },
      },
    },
  },
} satisfies Prisma.DepositRequestSelect;

export type AdminDepositWithRelations = Prisma.DepositRequestGetPayload<{
  select: typeof adminDepositSelect;
}>;

export class AdminDepositsMapper {
  static mapAttachment(att: AdminDepositAttachmentDto): AdminDepositAttachmentDto {
    return att;
  }

  static toAccountTxDto(accountTx: AdminDepositWithRelations['accountTx']): AdminDepositAccountTxDto | null {
    if (!accountTx) return null;

    return {
      id: accountTx.id,
      accountId: accountTx.accountId,
      createdAt: accountTx.createdAt,
      type: accountTx.type,
      refType: accountTx.refType,
      refId: accountTx.refId ?? null,
      delta: new Decimal(accountTx.delta).toString(),
      account: accountTx.account
        ? {
            id: accountTx.account.id,
            instrument: accountTx.account.instrument,
          }
        : null,
    };
  }

  static toDetail(
    deposit: AdminDepositWithRelations,
    attachments: AdminDepositAttachmentDto[],
    outbox?: { id: string; status: string; lastError?: string | null; method: string; retryCount: number; correlationId?: string | null; tahesabFactorCode?: string | null; createdAt: Date; updatedAt: Date },
  ): AdminDepositDetailDto {
    return {
      id: deposit.id,
      userId: deposit.userId,
      user: toUserSafeDto(deposit.user),
      amount: new Decimal(deposit.amount).toString(),
      method: deposit.method,
      status: deposit.status,
      refNo: deposit.refNo ?? null,
      note: deposit.note ?? null,
      processedAt: deposit.processedAt ?? null,
      processedById: deposit.processedById ?? null,
      processedBy: toUserMinimalDto(deposit.processedBy),
      accountTx: this.toAccountTxDto(deposit.accountTx),
      attachments,
      outbox: outbox
        ? {
            id: outbox.id,
            status: outbox.status,
            lastError: outbox.lastError ?? null,
            correlationId: outbox.correlationId ?? null,
            method: outbox.method,
            retryCount: outbox.retryCount,
            tahesabFactorCode: outbox.tahesabFactorCode ?? null,
            createdAt: outbox.createdAt,
            updatedAt: outbox.updatedAt,
          }
        : null,
      createdAt: deposit.createdAt,
      updatedAt: deposit.updatedAt,
    };
  }
}

export const attachmentSelect = {
  id: true,
  createdAt: true,
  purpose: true,
  fileId: true,
  entityId: true,
  entityType: true,
  file: {
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      label: true,
      createdAt: true,
    },
  },
} satisfies Prisma.AttachmentSelect;

export type AdminAttachment = Prisma.AttachmentGetPayload<{ select: typeof attachmentSelect }>;

export function mapAdminAttachment(att: AdminAttachment): AdminDepositAttachmentDto {
  return {
    id: att.id,
    fileId: att.fileId,
    purpose: att.purpose ?? null,
    createdAt: att.createdAt,
    file: att.file,
  };
}

export const adminDepositAttachmentWhere = (id: string) => ({
  entityId: id,
  entityType: AttachmentEntityType.DEPOSIT,
});

