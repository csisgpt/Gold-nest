import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AccountTxType,
  AttachmentEntityType,
  Instrument,
  SettlementMethod,
  TradeSide,
  TradeStatus,
  TradeType,
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
import { TahesabOutboxService } from '../tahesab/tahesab-outbox.service';
import { TahesabIntegrationConfigService } from '../tahesab/tahesab-integration.config';
import { BuyOrSale, SabteKolOrMovaghat } from '../tahesab/tahesab.methods';
import { GoldBuySellDto, SimpleVoucherDto } from '../tahesab/tahesab-documents.service';
import { SettleForwardCashDto } from './dto/settle-forward-cash.dto';

type TradeWithRelations =
  | (Awaited<ReturnType<PrismaService['trade']['findUnique']>> & {
      instrument?: Instrument;
      client?: { tahesabCustomerCode?: string | null } | null;
    })
  | null;

@Injectable()
export class TradesService {
  private readonly logger = new Logger(TradesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly filesService: FilesService,
    private readonly instrumentsService: InstrumentsService,
    private readonly tahesabOutbox: TahesabOutboxService,
    private readonly tahesabIntegration: TahesabIntegrationConfigService,
  ) {}

  /**
   * Trade state transitions (high level):
   * - PENDING -> APPROVED | REJECTED | CANCELLED_* (cancelled by admin/user)
   * - APPROVED -> SETTLED | CANCELLED_* (cannot settle twice)
   * - SETTLED is terminal for wallet operations and cannot be cancelled.
   */

  private validateTypeAndSettlementMethod(type: TradeType, method: SettlementMethod): void {
    const allowedByType: Record<TradeType, SettlementMethod[]> = {
      [TradeType.SPOT]: [
        SettlementMethod.WALLET,
        SettlementMethod.CASH,
        SettlementMethod.EXTERNAL,
        SettlementMethod.PHYSICAL,
      ],
      [TradeType.TOMORROW]: [
        SettlementMethod.CASH,
        SettlementMethod.PHYSICAL,
        SettlementMethod.MIXED,
      ],
      [TradeType.DAY_AFTER]: [
        SettlementMethod.CASH,
        SettlementMethod.PHYSICAL,
        SettlementMethod.MIXED,
      ],
    };

    const allowed = allowedByType[type];
    if (!allowed?.includes(method)) {
      throw new BadRequestException(
        `Settlement method ${method} is not allowed for trade type ${type}`,
      );
    }
  }

  async createForUser(userId: string, dto: CreateTradeDto) {
    const instrument = await this.instrumentsService.findByCode(dto.instrumentCode);
    const quantity = new Decimal(dto.quantity);
    const pricePerUnit = await this.resolvePricePerUnit(dto, instrument);
    const totalAmount = quantity.mul(pricePerUnit);
    // Default to SPOT to preserve existing behavior until clients explicitly pass forward types.
    const tradeType = dto.type ?? TradeType.SPOT;

    this.validateTypeAndSettlementMethod(tradeType, dto.settlementMethod);

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

    if (dto.settlementMethod === SettlementMethod.WALLET && dto.side === TradeSide.SELL) {
      const assetAccount = await this.accountsService.getOrCreateAccount(
        userId,
        instrument.code,
      );

      const usable = new Decimal(assetAccount.balance).minus(assetAccount.minBalance);
      if (usable.lt(quantity)) {
        throw new InsufficientCreditException(
          'Not enough asset balance to sell with WALLET settlement',
        );
      }
    }

    const trade = await this.prisma.$transaction(async (tx) => {
      const record = await tx.trade.create({
        data: {
          clientId: userId,
          instrumentId: instrument.id,
          side: dto.side,
          settlementMethod: dto.settlementMethod,
          type: tradeType,
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
    const updatedTrade = await this.prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findUnique({
        where: { id },
        include: { instrument: true, client: true },
      });
      if (!trade) throw new NotFoundException('Trade not found');
      if (trade.status !== TradeStatus.PENDING) {
        throw new BadRequestException(
          `Only PENDING trades can be approved (current status: ${trade.status})`,
        );
      }

      const { count: updatedCount } = await tx.trade.updateMany({
        where: { id: trade.id, status: TradeStatus.PENDING },
        data: {
          status: TradeStatus.APPROVED,
          approvedAt: new Date(),
          approvedById: adminId,
          adminNote: dto.adminNote,
        },
      });

      if (updatedCount === 0) {
        throw new BadRequestException(
          `Only PENDING trades can be approved (current status: ${trade.status})`,
        );
      }

      const quantity = new Decimal(trade.quantity);
      const total = new Decimal(trade.totalAmount);

      if (trade.settlementMethod === SettlementMethod.WALLET) {
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

        const irrAccount = await this.accountsService.getOrCreateAccount(
          trade.clientId,
          IRR_INSTRUMENT_CODE,
          tx,
        );
        if (trade.side === TradeSide.BUY) {
          const usable = new Decimal(irrAccount.balance).minus(irrAccount.minBalance);
          if (usable.lt(total)) {
            throw new InsufficientCreditException('Insufficient IRR for settlement');
          }
        }

        if (trade.side === TradeSide.SELL) {
          const usableAssetBalance = new Decimal(userAsset.balance).minus(
            userAsset.minBalance,
          );
          if (usableAssetBalance.lt(quantity)) {
            throw new InsufficientCreditException('Not enough asset to approve sell trade');
          }
        }

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
        // For external, cash, or physical settlement we only mark the trade approved for now.
        // Tahesab enqueueing for physical settlement (and optional cash PnL legs) is handled
        // after the transaction using the outbox to stay asynchronous.
        // TODO: Post receivables/payables or cash ledgers for forward/T+1 settlements when
        // those flows are formalized in the domain model.
      }

      const updatedTrade = await tx.trade.findUnique({
        where: { id: trade.id },
        include: { instrument: true, client: true },
      });
      this.logger.log(
        `Trade ${trade.id} status ${trade.status} -> ${updatedTrade?.status} by admin ${adminId}`,
      );

      return updatedTrade;
    });

    await this.enqueueTahesabForWalletTrade(updatedTrade);
    await this.enqueueTahesabForForwardPhysicalSettlement(updatedTrade);

    if (
      updatedTrade &&
      (updatedTrade.type === TradeType.TOMORROW || updatedTrade.type === TradeType.DAY_AFTER) &&
      updatedTrade.settlementMethod === SettlementMethod.CASH
    ) {
      // TODO: enqueue forward cash settlement voucher (DoNewSanadVKHVaghNaghd/VKHBank) using
      // SimpleVoucherDto once forward settlement amounts/PnL fields are formalized on the Trade
      // entity. Reuse the new TradeType distinctions to avoid mixing SPOT and forward logic.
    }

    return updatedTrade;
  }

  private resolveAyar(instrumentCode: string): number {
    return instrumentCode === GOLD_750_INSTRUMENT_CODE ? 750 : 750;
  }

  private async enqueueTahesabForWalletTrade(trade: TradeWithRelations): Promise<void> {
    if (!trade) return;
    if (trade.status !== TradeStatus.APPROVED) return;
    if (trade.type !== TradeType.SPOT) return;
    if (trade.settlementMethod !== SettlementMethod.WALLET) return;
    if (!this.tahesabIntegration.isEnabled()) return;

    const moshtariCode = this.tahesabIntegration.getCustomerCode(trade.client ?? null);
    if (!moshtariCode) return;

    const { shamsiYear, shamsiMonth, shamsiDay } = this.tahesabIntegration.formatDateParts(
      trade.approvedAt ?? trade.updatedAt ?? trade.createdAt,
    );

    const dto: GoldBuySellDto = {
      sabteKolOrMovaghat: SabteKolOrMovaghat.Kol,
      moshtariCode,
      factorNumber: trade.id,
      shamsiYear,
      shamsiMonth,
      shamsiDay,
      mablagh: Number(trade.totalAmount),
      ayar: this.resolveAyar(trade.instrument?.code ?? ''),
      vazn: Number(trade.quantity),
      angNumber: trade.instrument?.code ?? '',
      nameAz: trade.instrument?.name ?? trade.instrument?.code ?? '',
      buyOrSale: trade.side === TradeSide.BUY ? BuyOrSale.Buy : BuyOrSale.Sell,
      sharh: `${this.tahesabIntegration.getDescriptionPrefix()} Trade ${trade.id}`,
    };

    await this.tahesabOutbox.enqueueOnce('DoNewSanadBuySaleGOLD', dto, {
      correlationId: trade.id,
    });

    // Cash leg for WALLET settlements is already reflected in internal accounts.
    // If Tahesab requires explicit cash entries, hook them up here using
    // DoNewSanadVKHVaghNaghd and distinct correlation IDs.

    // TODO: integrate DoNewSanadTakhfif for commissions/discounts once
    // commission amounts are tracked on the Trade entity.
  }

  /**
   * Enqueues a Tahesab gold buy/sell document for forward trades settled via physical delivery.
   * Uses DoNewSanadBuySaleGOLD through the outbox to remain idempotent and asynchronous.
   */
  private async enqueueTahesabForForwardPhysicalSettlement(trade: TradeWithRelations): Promise<void> {
    if (!trade) return;
    if (trade.status !== TradeStatus.APPROVED) return;
    if (trade.type !== TradeType.TOMORROW && trade.type !== TradeType.DAY_AFTER) return;
    if (
      trade.settlementMethod !== SettlementMethod.PHYSICAL &&
      trade.settlementMethod !== SettlementMethod.MIXED
    ) {
      return;
    }
    if (!this.tahesabIntegration.isEnabled()) return;

    const moshtariCode = this.tahesabIntegration.getCustomerCode(trade.client ?? null);
    if (!moshtariCode) return;

    const { shamsiYear, shamsiMonth, shamsiDay } = this.tahesabIntegration.formatDateParts(
      trade.approvedAt ?? trade.updatedAt ?? trade.createdAt,
    );

    const dto: GoldBuySellDto = {
      sabteKolOrMovaghat: SabteKolOrMovaghat.Kol,
      moshtariCode,
      factorNumber: trade.id,
      shamsiYear,
      shamsiMonth,
      shamsiDay,
      mablagh: Number(trade.totalAmount),
      ayar: this.resolveAyar(trade.instrument?.code ?? ''),
      vazn: Number(trade.quantity),
      angNumber: trade.instrument?.code ?? '',
      nameAz: trade.instrument?.name ?? trade.instrument?.code ?? '',
      buyOrSale: trade.side === TradeSide.BUY ? BuyOrSale.Buy : BuyOrSale.Sell,
      sharh: `${this.tahesabIntegration.getDescriptionPrefix()} Forward physical trade ${trade.id}`,
    };

    await this.tahesabOutbox.enqueueOnce('DoNewSanadBuySaleGOLD', dto, {
      correlationId: `forward:physical:${trade.id}`,
    });

    // TODO: clarify whether a cash PnL voucher is required alongside physical delivery
    // settlements; reuse the forward cash settlement DTO mapping once the business rule
    // is confirmed.
  }

  private async enqueueTahesabDeletionForTrade(tradeId: string): Promise<void> {
    const existing = await this.prisma.tahesabOutbox.findFirst({
      where: {
        correlationId: tradeId,
        method: 'DoNewSanadBuySaleGOLD',
        status: 'SUCCESS',
        tahesabFactorCode: { not: null },
      },
    });

    if (!existing?.tahesabFactorCode) {
      this.logger.debug(`No Tahesab factor code stored for trade ${tradeId}; skipping deletion enqueue.`);
      return;
    }

    await this.tahesabOutbox.enqueueOnce(
      'DoDeleteSanad',
      { factorCode: existing.tahesabFactorCode },
      { correlationId: `spot:cancel:${tradeId}` },
    );
  }

  async settleForwardTradeInCash(tradeId: string, dto: SettleForwardCashDto, adminId?: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        include: { client: true, instrument: true },
      });
      if (!trade) throw new NotFoundException('Trade not found');
      if (trade.type !== TradeType.TOMORROW && trade.type !== TradeType.DAY_AFTER) {
        throw new BadRequestException('Only forward trades can be settled in cash');
      }
      if (trade.settlementMethod !== SettlementMethod.CASH && trade.settlementMethod !== SettlementMethod.MIXED) {
        throw new BadRequestException('Settlement method must be CASH or MIXED');
      }
      if (trade.status === TradeStatus.SETTLED) {
        throw new BadRequestException('Trade is already settled');
      }
      if (trade.status === TradeStatus.CANCELLED_BY_ADMIN || trade.status === TradeStatus.CANCELLED_BY_USER) {
        throw new BadRequestException('Cannot settle a cancelled trade');
      }
      if (trade.status !== TradeStatus.APPROVED) {
        throw new BadRequestException(
          `Only APPROVED forward trades can be settled in cash (current status: ${trade.status})`,
        );
      }

      const amount = new Decimal(dto.settlementAmount);

      // settlementAmount > 0 => client pays (loss). settlementAmount < 0 => client receives (gain).
      if (trade.settlementMethod === SettlementMethod.CASH || trade.settlementMethod === SettlementMethod.MIXED) {
        if (!amount.isZero()) {
          const userIrr = await this.accountsService.getOrCreateAccount(
            trade.clientId,
            IRR_INSTRUMENT_CODE,
            tx,
          );

          const houseIrr = await this.accountsService.getOrCreateAccount(
            HOUSE_USER_ID,
            IRR_INSTRUMENT_CODE,
            tx,
          );

          if (amount.gt(0)) {
            const usable = new Decimal(userIrr.balance).minus(userIrr.minBalance);
            if (usable.lt(amount)) {
              throw new InsufficientCreditException(
                'Not enough IRR balance for forward cash settlement',
              );
            }

            await this.accountsService.applyTransaction(
              tx,
              userIrr,
              amount.negated(),
              AccountTxType.TRADE_DEBIT,
              TxRefType.TRADE,
              trade.id,
              adminId,
            );

            await this.accountsService.applyTransaction(
              tx,
              houseIrr,
              amount,
              AccountTxType.TRADE_CREDIT,
              TxRefType.TRADE,
              trade.id,
              adminId,
            );
          } else {
            const absAmount = amount.abs();
            const usableHouse = new Decimal(houseIrr.balance).minus(houseIrr.minBalance);
            if (usableHouse.lt(absAmount)) {
              throw new InsufficientCreditException(
                'House IRR balance is not enough to credit client for forward cash settlement',
              );
            }

            await this.accountsService.applyTransaction(
              tx,
              houseIrr,
              absAmount.negated(),
              AccountTxType.TRADE_DEBIT,
              TxRefType.TRADE,
              trade.id,
              adminId,
            );

            await this.accountsService.applyTransaction(
              tx,
              userIrr,
              absAmount,
              AccountTxType.TRADE_CREDIT,
              TxRefType.TRADE,
              trade.id,
              adminId,
            );
          }
        }
      }

      const updatedTrade = await tx.trade.update({
        where: { id: trade.id },
        data: {
          settlementPrice: new Decimal(dto.settlementPrice),
          settlementAmount: amount,
          realizedPnl: dto.realizedPnl !== undefined ? new Decimal(dto.realizedPnl) : undefined,
          status: TradeStatus.SETTLED,
          approvedById: trade.approvedById ?? adminId,
        },
        include: { client: true, instrument: true },
      });

      return updatedTrade;
    });

    await this.enqueueTahesabForForwardCashSettlement(updated);
    return updated;
  }

  async cancelTrade(tradeId: string, reason?: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        include: { client: true, instrument: true },
      });
      if (!trade) throw new NotFoundException('Trade not found');
      if (trade.status === TradeStatus.CANCELLED_BY_ADMIN || trade.status === TradeStatus.CANCELLED_BY_USER) {
        return trade;
      }
      if (trade.status === TradeStatus.SETTLED) {
        // TODO: full rollback of settled trades requires explicit rules.
        throw new BadRequestException('Cannot cancel a settled trade');
      }
      if (trade.status !== TradeStatus.PENDING && trade.status !== TradeStatus.APPROVED) {
        throw new BadRequestException(
          `Only PENDING or APPROVED trades can be cancelled (current status: ${trade.status})`,
        );
      }

      const cancelStatus = TradeStatus.CANCELLED_BY_ADMIN;

      const updatedTrade = await tx.trade.update({
        where: { id: trade.id },
        data: { status: cancelStatus, adminNote: reason ?? trade.adminNote },
        include: { client: true, instrument: true },
      });

      return updatedTrade;
    });

    await this.enqueueTahesabDeletionForTrade(tradeId);
    return updated;
  }

  private async enqueueTahesabForForwardCashSettlement(trade: TradeWithRelations): Promise<void> {
    if (!trade) return;
    if (trade.type !== TradeType.TOMORROW && trade.type !== TradeType.DAY_AFTER) return;
    if (trade.settlementMethod !== SettlementMethod.CASH && trade.settlementMethod !== SettlementMethod.MIXED) return;
    if (!trade.settlementAmount || new Decimal(trade.settlementAmount).eq(0)) return;
    if (!this.tahesabIntegration.isEnabled()) return;

    const moshtariCode = this.tahesabIntegration.getCustomerCode(trade.client ?? null);
    if (!moshtariCode) return;

    const { shamsiYear, shamsiMonth, shamsiDay } = this.tahesabIntegration.formatDateParts(
      trade.approvedAt ?? trade.updatedAt ?? trade.createdAt,
    );

    const amount = new Decimal(trade.settlementAmount);
    // Wallet balances are already updated inline; this voucher mirrors the cash movement in Tahesab.
    const dto: SimpleVoucherDto = {
      sabteKolOrMovaghat: SabteKolOrMovaghat.Kol,
      moshtariCode,
      factorNumber: trade.id,
      shamsiYear,
      shamsiMonth,
      shamsiDay,
      mablagh: amount.abs().toNumber(),
      sharh: `${this.tahesabIntegration.getDescriptionPrefix()} Forward cash settlement ${trade.id}`,
      factorCode: this.tahesabIntegration.getDefaultCashAccountCode() ?? '',
    };

    if (!dto.factorCode) {
      this.logger.warn('No default cash account configured for forward cash settlement');
      return;
    }

    await this.tahesabOutbox.enqueueOnce('DoNewSanadVKHVaghNaghd', dto, {
      correlationId: `forward:cash:${trade.id}`,
    });
  }

  /**
   * Resolves the price per unit for a trade. Currently trusts client input but intended to
   * be replaced by a server-driven price feed in future iterations.
   */
  private async resolvePricePerUnit(dto: CreateTradeDto, instrument: Instrument): Promise<Decimal> {
    // For now, keep trusting dto.pricePerUnit, but centralize it here. In the future, this should
    // read the price from an InstrumentPrice table or external price feed instead of trusting
    // client input.
    return new Decimal(dto.pricePerUnit);
  }

  async reject(id: string, dto: RejectTradeDto, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findUnique({ where: { id } });
      if (!trade) throw new NotFoundException('Trade not found');
      if (trade.status !== TradeStatus.PENDING) {
        throw new BadRequestException(
          `Only PENDING trades can be rejected (current status: ${trade.status})`,
        );
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
