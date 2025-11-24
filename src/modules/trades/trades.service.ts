import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AccountTxType,
  AttachmentEntityType,
  SettlementMethod,
  TradeSide,
  TradeStatus,
  TxRefType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { FilesService } from '../files/files.service';
import { GOLD_750_INSTRUMENT_CODE, HOUSE_USER_ID, IRR_INSTRUMENT_CODE } from '../accounts/constants';
import { CreateTradeDto } from './dto/create-trade.dto';
import { ApproveTradeDto } from './dto/approve-trade.dto';
import { RejectTradeDto } from './dto/reject-trade.dto';
import { InsufficientCreditException } from '../../common/exceptions/insufficient-credit.exception';
import { InstrumentsService } from '../instruments/instruments.service';

@Injectable()
export class TradesService {
  private readonly logger = new Logger(TradesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly filesService: FilesService,
    private readonly instrumentsService: InstrumentsService,
  ) {}

  async createForUser(userId: string, dto: CreateTradeDto) {
    const instrument = await this.instrumentsService.findByCode(dto.instrumentCode);
    const quantity = new Decimal(dto.quantity);
    const pricePerUnit = new Decimal(dto.pricePerUnit);
    const totalAmount = quantity.mul(pricePerUnit);

    if (quantity.lte(0) || pricePerUnit.lte(0)) {
      throw new BadRequestException('Quantity and pricePerUnit must be positive');
    }

    if (dto.settlementMethod === SettlementMethod.WALLET && dto.side === TradeSide.BUY) {
      // Wallet funded buys require sufficient IRR capacity
      const irrAccount = await this.accountsService.getOrCreateAccount(
        userId,
        IRR_INSTRUMENT_CODE,
      );
      const usable = new Decimal(irrAccount.balance).minus(irrAccount.minBalance);
      if (usable.lt(totalAmount)) {
        throw new InsufficientCreditException('Not enough IRR usable balance to open BUY trade');
      }
    }

    const trade = await this.prisma.$transaction(async (tx) => {
      const record = await tx.trade.create({
        data: {
          clientId: userId,
          instrumentId: instrument.id,
          side: dto.side,
          settlementMethod: dto.settlementMethod,
          quantity,
          pricePerUnit,
          totalAmount,
          clientNote: dto.clientNote,
        },
      });

      await this.filesService.createAttachments(
        dto.fileIds,
        AttachmentEntityType.TRADE,
        record.id,
        tx,
      );

      return record;
    });

    return trade;
  }

  findMy(userId: string) {
    return this.prisma.trade.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByStatus(status?: TradeStatus) {
    return this.prisma.trade.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(id: string, dto: ApproveTradeDto, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findUnique({
        where: { id },
        include: { instrument: true },
      });
      if (!trade) throw new NotFoundException('Trade not found');
      if (trade.status !== TradeStatus.PENDING) {
        throw new BadRequestException('Trade already processed');
      }

      const quantity = new Decimal(trade.quantity);
      const total = new Decimal(trade.totalAmount);

      if (trade.settlementMethod === SettlementMethod.WALLET) {
        const irrAccount = await this.accountsService.getOrCreateAccount(
          trade.clientId,
          IRR_INSTRUMENT_CODE,
          tx,
        );
        const usable = new Decimal(irrAccount.balance).minus(irrAccount.minBalance);
        if (trade.side === TradeSide.BUY && usable.lt(total)) {
          throw new InsufficientCreditException('Insufficient IRR for settlement');
        }

        const houseIrr = await this.accountsService.getOrCreateAccount(
          HOUSE_USER_ID,
          IRR_INSTRUMENT_CODE,
          tx,
        );
        const userAsset = await this.accountsService.getOrCreateAccount(
          trade.clientId,
          trade.instrument.code,
          tx,
        );
        const houseAsset = await this.accountsService.getOrCreateAccount(
          HOUSE_USER_ID,
          trade.instrument.code,
          tx,
        );

        if (trade.side === TradeSide.BUY) {
          await this.accountsService.applyTransaction(
            {
              accountId: irrAccount.id,
              delta: total.negated(),
              type: AccountTxType.TRADE_DEBIT,
              refType: TxRefType.TRADE,
              refId: trade.id,
              createdById: adminId,
            },
            tx,
          );
          await this.accountsService.applyTransaction(
            {
              accountId: houseIrr.id,
              delta: total,
              type: AccountTxType.TRADE_CREDIT,
              refType: TxRefType.TRADE,
              refId: trade.id,
              createdById: adminId,
            },
            tx,
          );
          await this.accountsService.applyTransaction(
            {
              accountId: userAsset.id,
              delta: quantity,
              type: AccountTxType.TRADE_CREDIT,
              refType: TxRefType.TRADE,
              refId: trade.id,
              createdById: adminId,
            },
            tx,
          );
          await this.accountsService.applyTransaction(
            {
              accountId: houseAsset.id,
              delta: quantity.negated(),
              type: AccountTxType.TRADE_DEBIT,
              refType: TxRefType.TRADE,
              refId: trade.id,
              createdById: adminId,
            },
            tx,
          );
        } else {
          await this.accountsService.applyTransaction(
            {
              accountId: irrAccount.id,
              delta: total,
              type: AccountTxType.TRADE_CREDIT,
              refType: TxRefType.TRADE,
              refId: trade.id,
              createdById: adminId,
            },
            tx,
          );
          await this.accountsService.applyTransaction(
            {
              accountId: houseIrr.id,
              delta: total.negated(),
              type: AccountTxType.TRADE_DEBIT,
              refType: TxRefType.TRADE,
              refId: trade.id,
              createdById: adminId,
            },
            tx,
          );
          await this.accountsService.applyTransaction(
            {
              accountId: userAsset.id,
              delta: quantity.negated(),
              type: AccountTxType.TRADE_DEBIT,
              refType: TxRefType.TRADE,
              refId: trade.id,
              createdById: adminId,
            },
            tx,
          );
          await this.accountsService.applyTransaction(
            {
              accountId: houseAsset.id,
              delta: quantity,
              type: AccountTxType.TRADE_CREDIT,
              refType: TxRefType.TRADE,
              refId: trade.id,
              createdById: adminId,
            },
            tx,
          );
        }
      } else {
        // For external and cash settlement we only mark the trade approved for now.
        // Future work: post corresponding receivables/payables or cash ledgers.
      }

      const updated = await tx.trade.update({
        where: { id },
        data: {
          status: TradeStatus.APPROVED,
          approvedAt: new Date(),
          approvedById: adminId,
          adminNote: dto.adminNote,
        },
      });

      this.logger.log(`Trade ${trade.id} status ${trade.status} -> ${updated.status} by admin ${adminId}`);

      return updated;
    });
  }

  async reject(id: string, dto: RejectTradeDto, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findUnique({ where: { id } });
      if (!trade) throw new NotFoundException('Trade not found');
      if (trade.status !== TradeStatus.PENDING) {
        throw new BadRequestException('Trade already processed');
      }

      const updated = await tx.trade.update({
        where: { id },
        data: {
          status: TradeStatus.REJECTED,
          rejectedAt: new Date(),
          rejectReason: dto.rejectReason,
        },
      });

      this.logger.log(`Trade ${trade.id} status ${trade.status} -> ${updated.status} by admin ${adminId}`);

      return updated;
    });
  }
}
