import { AttachmentEntityType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toUserMinimalDto, toUserSafeDto } from '../../common/mappers/user.mapper';
import { userMinimalSelect, userSafeSelect } from '../../common/prisma/selects/user.select';
import {
  AdminWithdrawalAccountTxDto,
  AdminWithdrawalAttachmentDto,
  AdminWithdrawalDetailDto,
} from './dto/response/admin-withdrawal-detail.dto';

export const adminWithdrawalSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  amount: true,
  status: true,
  bankName: true,
  iban: true,
  cardNumber: true,
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
} satisfies Prisma.WithdrawRequestSelect;

export type AdminWithdrawalWithRelations = Prisma.WithdrawRequestGetPayload<{
  select: typeof adminWithdrawalSelect;
}>;

export class AdminWithdrawalsMapper {
  static toAccountTxDto(
    accountTx: AdminWithdrawalWithRelations['accountTx'],
  ): AdminWithdrawalAccountTxDto | null {
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
    withdrawal: AdminWithdrawalWithRelations,
    attachments: AdminWithdrawalAttachmentDto[],
    outbox?: { id: string; status: string; lastError?: string | null; method: string; retryCount: number; correlationId?: string | null; tahesabFactorCode?: string | null; createdAt: Date; updatedAt: Date },
  ): AdminWithdrawalDetailDto {
    return {
      id: withdrawal.id,
      userId: withdrawal.userId,
      user: toUserSafeDto(withdrawal.user),
      amount: new Decimal(withdrawal.amount).toString(),
      status: withdrawal.status,
      bankName: withdrawal.bankName ?? null,
      iban: withdrawal.iban ?? null,
      cardNumber: withdrawal.cardNumber ?? null,
      note: withdrawal.note ?? null,
      processedAt: withdrawal.processedAt ?? null,
      processedById: withdrawal.processedById ?? null,
      processedBy: toUserMinimalDto(withdrawal.processedBy),
      accountTx: this.toAccountTxDto(withdrawal.accountTx),
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
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
    };
  }
}

export const adminWithdrawalAttachmentWhere = (id: string) => ({
  entityId: id,
  entityType: AttachmentEntityType.WITHDRAW,
});

