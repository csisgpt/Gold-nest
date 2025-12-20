import { Prisma } from '@prisma/client';
import { userMinimalSelect, userSafeSelect } from '../../common/prisma/selects/user.select';
import { toUserMinimalDto, toUserSafeDto } from '../../common/mappers/user.mapper';
import { TradeResponseDto, TradeInstrumentDto } from './dto/response/trade-response.dto';

export const tradeWithRelationsSelect = {
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

export type TradeWithRelations = Prisma.TradeGetPayload<{
  select: typeof tradeWithRelationsSelect;
}>;

export class TradesMapper {
  static toInstrumentDto(instrument: TradeWithRelations['instrument']): TradeInstrumentDto {
    return {
      id: instrument.id,
      code: instrument.code,
      name: instrument.name,
      unit: instrument.unit,
    };
  }

  static toResponse(trade: TradeWithRelations): TradeResponseDto {
    return {
      id: trade.id,
      clientId: trade.clientId,
      client: toUserSafeDto(trade.client),
      instrument: this.toInstrumentDto(trade.instrument),
      side: trade.side,
      status: trade.status,
      type: trade.type,
      settlementMethod: trade.settlementMethod,
      quantity: trade.quantity.toString(),
      pricePerUnit: trade.pricePerUnit.toString(),
      totalAmount: trade.totalAmount.toString(),
      entryPrice: trade.entryPrice?.toString() ?? null,
      settlementPrice: trade.settlementPrice?.toString() ?? null,
      settlementAmount: trade.settlementAmount?.toString() ?? null,
      realizedPnl: trade.realizedPnl?.toString() ?? null,
      clientNote: trade.clientNote,
      adminNote: trade.adminNote,
      approvedBy: toUserMinimalDto(trade.approvedBy),
      approvedById: trade.approvedById ?? null,
      approvedAt: trade.approvedAt ?? null,
      rejectedAt: trade.rejectedAt ?? null,
      rejectReason: trade.rejectReason ?? null,
      reversedAt: trade.reversedAt ?? null,
      createdAt: trade.createdAt,
      updatedAt: trade.updatedAt,
    };
  }
}
