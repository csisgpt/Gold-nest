import { AttachmentEntityType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { toUserMinimalDto, toUserSafeDto } from '../../common/mappers/user.mapper';
import { userMinimalSelect, userSafeSelect } from '../../common/prisma/selects/user.select';
import {
  AdminTradeAttachmentDto,
  AdminTradeDetailDto,
  AdminTradeInstrumentDto,
} from './dto/response/admin-trade-detail.dto';

export const adminTradeSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  clientId: true,
  instrumentId: true,
  side: true,
  status: true,
  type: true,
  settlementMethod: true,
  quantity: true,
  pricePerUnit: true,
  totalAmount: true,
  entryPrice: true,
  settlementPrice: true,
  settlementAmount: true,
  realizedPnl: true,
  clientNote: true,
  adminNote: true,
  approvedAt: true,
  approvedById: true,
  rejectedAt: true,
  rejectReason: true,
  reversedAt: true,
  client: { select: userSafeSelect },
  approvedBy: { select: userMinimalSelect },
  instrument: { select: { id: true, code: true, name: true, unit: true } },
} satisfies Prisma.TradeSelect;

export type AdminTradeWithRelations = Prisma.TradeGetPayload<{ select: typeof adminTradeSelect }>;

export class AdminTradesMapper {
  static toInstrumentDto(instrument: AdminTradeInstrumentDto): AdminTradeInstrumentDto {
    return instrument;
  }

  static toDetail(
    trade: AdminTradeWithRelations,
    attachments: AdminTradeAttachmentDto[],
    outbox?: { id: string; status: string; lastError?: string | null; method: string; retryCount: number; correlationId?: string | null; tahesabFactorCode?: string | null; createdAt: Date; updatedAt: Date },
  ): AdminTradeDetailDto {
    return {
      id: trade.id,
      clientId: trade.clientId,
      client: toUserSafeDto(trade.client),
      instrument: this.toInstrumentDto(trade.instrument),
      side: trade.side,
      status: trade.status,
      type: trade.type,
      settlementMethod: trade.settlementMethod,
      quantity: new Decimal(trade.quantity).toString(),
      pricePerUnit: new Decimal(trade.pricePerUnit).toString(),
      totalAmount: new Decimal(trade.totalAmount).toString(),
      entryPrice: trade.entryPrice ? new Decimal(trade.entryPrice).toString() : null,
      settlementPrice: trade.settlementPrice ? new Decimal(trade.settlementPrice).toString() : null,
      settlementAmount: trade.settlementAmount ? new Decimal(trade.settlementAmount).toString() : null,
      realizedPnl: trade.realizedPnl ? new Decimal(trade.realizedPnl).toString() : null,
      clientNote: trade.clientNote ?? null,
      adminNote: trade.adminNote ?? null,
      approvedBy: toUserMinimalDto(trade.approvedBy),
      approvedById: trade.approvedById ?? null,
      approvedAt: trade.approvedAt ?? null,
      rejectedAt: trade.rejectedAt ?? null,
      rejectReason: trade.rejectReason ?? null,
      reversedAt: trade.reversedAt ?? null,
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
      createdAt: trade.createdAt,
      updatedAt: trade.updatedAt,
    };
  }
}

export const adminTradeAttachmentWhere = (id: string) => ({
  entityId: id,
  entityType: AttachmentEntityType.TRADE,
});

