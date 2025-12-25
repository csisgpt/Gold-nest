import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountTxType,
  AttachmentEntityType,
  Prisma,
  InstrumentType,
  Instrument,
  PolicyAction,
  PolicyMetric,
  PolicyPeriod,
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
import { runInTx } from '../../common/db/tx.util';
import { TradesMapper, TradeWithRelations, tradeWithRelationsSelect } from './trades.mapper';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { PaginationService } from '../../common/pagination/pagination.service';
import { AdminListTradesDto } from './dto/admin-list-trades.dto';
import { AdminTradeDetailDto } from './dto/response/admin-trade-detail.dto';
import { AdminTradesMapper, adminTradeAttachmentWhere, adminTradeSelect } from './trades.admin.mapper';
import { LimitsService } from '../policy/limits.service';
import { QuoteLockService } from '../market/quotes/quote-lock.service';

@Injectable()
export class TradesService {
  private readonly logger = new Logger(TradesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly limitsService: LimitsService,
    private readonly filesService: FilesService,
    private readonly instrumentsService: InstrumentsService,
    private readonly tahesabOutbox: TahesabOutboxService,
    private readonly tahesabIntegration: TahesabIntegrationConfigService,
    private readonly paginationService: PaginationService,
    private readonly quoteLockService: QuoteLockService,
  ) {}

  /**
   * Trade state transitions (high level):
   * - PENDING -> APPROVED | REJECTED | CANCELLED_* (cancelled by admin/user)
   * - APPROVED -> SETTLED | CANCELLED_* (cannot settle twice)
   * - SETTLED is terminal for wallet operations and cannot be cancelled.
   */

  private validateTypeAndSettlementMethod(type: TradeType, method: SettlementMethod): void {
    if (method !== SettlementMethod.WALLET) {
      throw new BadRequestException({
        code: 'NOT_IMPLEMENTED',
        message: `Settlement method ${method} is not implemented for trades`,
      });
    }

    if (type !== TradeType.SPOT) {
      throw new BadRequestException({
        code: 'NOT_IMPLEMENTED',
        message: `Trade type ${type} is not implemented for wallet settlement`,
      });
    }
  }

  async createForUser(user: JwtRequestUser, dto: CreateTradeDto, idempotencyKey?: string) {
    const quantity = new Decimal(dto.quantity);
    if (quantity.lte(0)) {
      throw new BadRequestException('Quantity must be positive');
    }

    if (dto.quoteId) {
      return this.createWithQuoteLock(user, dto, quantity, idempotencyKey);
    }

    return this.createWithLatestQuote(user, dto, quantity, idempotencyKey);
  }

  private async createWithQuoteLock(
    user: JwtRequestUser,
    dto: CreateTradeDto,
    quantity: Decimal,
    idempotencyKey?: string,
  ) {
    const lock = await this.quoteLockService.consumeForUser(dto.quoteId!, user.id);
    if (dto.side !== lock.side) {
      throw new ConflictException({ code: 'QUOTE_LOCK_SIDE_MISMATCH', message: 'Trade side does not match locked quote' });
    }

    const instrument = await this.prisma.instrument.findUnique({ where: { id: lock.baseInstrumentId } });
    if (!instrument) {
      throw new NotFoundException('Instrument not found for locked quote');
    }

    const product = await this.prisma.marketProduct.findUnique({ where: { id: lock.productId } });
    if (!product) {
      throw new NotFoundException({ code: 'MARKET_PRODUCT_NOT_FOUND', message: 'Product missing for quote' });
    }

    const pricePerUnit = new Decimal(lock.executablePrice);
    const totalAmount = quantity.mul(pricePerUnit);
    const tradeType = product.tradeType ?? dto.type ?? TradeType.SPOT;

    if (pricePerUnit.lte(0)) {
      throw new BadRequestException({ code: 'INVALID_PRICE', message: 'Locked price is invalid' });
    }

    this.validateTypeAndSettlementMethod(tradeType, dto.settlementMethod);

    return runInTx(
      this.prisma,
      async (tx) => {
        if (idempotencyKey) {
          const existing = await tx.trade.findFirst({
            where: { clientId: user.id, idempotencyKey },
            select: tradeWithRelationsSelect,
          });
          if (existing) {
            this.logger.debug(`Reusing idempotent trade ${existing.id} for user ${user.id}`);
            return existing as TradeWithRelations;
          }
        }

        const existingByQuote = await tx.trade.findFirst({
          where: { clientId: user.id, quoteId: lock.quoteId },
          select: tradeWithRelationsSelect,
        });
        if (existingByQuote) {
          return existingByQuote as TradeWithRelations;
        }

        const trade = await tx.trade.create({
          data: {
            clientId: user.id,
            instrumentId: instrument.id,
            side: dto.side,
            settlementMethod: dto.settlementMethod,
            type: tradeType,
            quantity,
            pricePerUnit,
            executedPrice: pricePerUnit,
            totalAmount,
            quoteId: lock.quoteId,
            priceSourceType: (lock.source?.type as any) ?? null,
            priceSourceKey: lock.source?.providerKey ?? null,
            priceSourceRefId: lock.source?.overrideId ?? null,
            priceSourceAsOf: lock.asOf ? new Date(lock.asOf) : null,
            lockedBaseBuy: lock.baseBuy,
            lockedBaseSell: lock.baseSell,
            lockedDisplayBuy: lock.displayBuy,
            lockedDisplaySell: lock.displaySell,
            clientNote: dto.clientNote,
            idempotencyKey,
          },
        });

        await this.reserveLimitsForTrade({
          action: dto.side === TradeSide.BUY ? PolicyAction.TRADE_BUY : PolicyAction.TRADE_SELL,
          instrument,
          metric: lock.metric,
          productId: lock.productId,
          quantity,
          totalAmount,
          trade,
          tx,
        });

        await this.reserveFundsForTrade({
          trade: { ...trade, instrument } as unknown as TradeWithRelations,
          instrument,
          quantity,
          totalAmount,
          tx,
        });

        await this.filesService.createAttachmentsForActor(
          { id: user.id, role: user.role },
          dto.fileIds,
          AttachmentEntityType.TRADE,
          trade.id,
          tx,
        );

        await this.quoteLockService.markConsumed(lock.quoteId, trade.id, tx);

        this.logger.log(`Trade ${trade.id} created for user ${user.id} using quote ${lock.quoteId}`);

        return tx.trade.findUnique({ where: { id: trade.id }, select: tradeWithRelationsSelect });
      },
      { logger: this.logger },
    );
  }

  private async createWithLatestQuote(
    user: JwtRequestUser,
    dto: CreateTradeDto,
    quantity: Decimal,
    idempotencyKey?: string,
  ) {
    if (!dto.instrumentCode) {
      throw new BadRequestException({ code: 'QUOTE_REQUIRED', message: 'instrumentCode is required when quoteId is missing' });
    }

    const instrument = await this.prisma.instrument.findUnique({ where: { code: dto.instrumentCode } });
    if (!instrument) {
      throw new NotFoundException('Instrument not found');
    }

    const product = await this.prisma.marketProduct.findFirst({
      where: { baseInstrumentId: instrument.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!product) {
      throw new ConflictException({ code: 'NO_MARKET_PRODUCT', message: 'No market product for instrument' });
    }

    const quote = await this.quoteLockService.lockQuote({
      userId: user.id,
      productId: product.id,
      side: dto.side,
      forceNew: true,
    });
    const tradeType = product.tradeType ?? dto.type ?? TradeType.SPOT;

    this.validateTypeAndSettlementMethod(tradeType, dto.settlementMethod);

    return this.createWithQuoteLock(
      user,
      { ...dto, quoteId: quote.quoteId, side: dto.side },
      quantity,
      idempotencyKey,
    );
  }

  private async reserveLimitsForTrade(params: {
    action: PolicyAction;
    instrument: Instrument;
    metric?: PolicyMetric;
    productId?: string;
    quantity: Decimal;
    totalAmount: Decimal;
    trade: { id: string; clientId: string };
    tx: Prisma.TransactionClient;
  }) {
    const reserveMetric = async (
      metric: PolicyMetric,
      amount: Decimal,
      instrumentKey: string,
      productId?: string,
    ) => {
      await this.limitsService.reserve(
        {
          userId: params.trade.clientId,
          action: params.action,
          metric,
          period: PolicyPeriod.DAILY,
          amount,
          instrumentKey,
          productId,
          instrumentId: params.instrument.id,
          instrumentType: params.instrument.type,
          refType: TxRefType.TRADE,
          refId: params.trade.id,
        },
        params.tx,
      );

      await this.limitsService.reserve(
        {
          userId: params.trade.clientId,
          action: params.action,
          metric,
          period: PolicyPeriod.MONTHLY,
          amount,
          instrumentKey,
          productId,
          instrumentId: params.instrument.id,
          instrumentType: params.instrument.type,
          refType: TxRefType.TRADE,
          refId: params.trade.id,
        },
        params.tx,
      );
    };

    const instrumentKey = params.productId ?? params.instrument.id ?? 'ALL';

    await reserveMetric(PolicyMetric.NOTIONAL_IRR, params.totalAmount, 'ALL', params.productId);

    const metric = params.metric
      ? params.metric
      : params.instrument.type === InstrumentType.GOLD
        ? PolicyMetric.WEIGHT_750_G
        : params.instrument.type === InstrumentType.COIN
          ? PolicyMetric.COUNT
          : null;

    if (metric) {
      await reserveMetric(metric, params.quantity, instrumentKey, params.productId);
    }
  }

  private async reserveFundsForTrade(params: {
    trade: TradeWithRelations;
    instrument: Instrument;
    quantity: Decimal;
    totalAmount: Decimal;
    tx: Prisma.TransactionClient;
  }) {
    if (params.trade.settlementMethod !== SettlementMethod.WALLET) return;

    if (params.trade.side === TradeSide.BUY) {
      await this.accountsService.reserveFunds({
        userId: params.trade.clientId,
        instrumentCode: IRR_INSTRUMENT_CODE,
        amount: params.totalAmount,
        refType: TxRefType.TRADE,
        refId: params.trade.id,
        tx: params.tx,
      });
      return;
    }

    await this.accountsService.reserveFunds({
      userId: params.trade.clientId,
      instrumentCode: params.instrument.code,
      amount: params.quantity,
      refType: TxRefType.TRADE,
      refId: params.trade.id,
      tx: params.tx,
    });
  }

  findMy(userId: string) {
    return this.prisma.trade.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByStatus(status?: TradeStatus) {
    const trades = await this.prisma.trade.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      select: tradeWithRelationsSelect,
    });

    return trades.map((trade) => TradesMapper.toResponse(trade as TradeWithRelations));
  }

  async listAdmin(query: AdminListTradesDto) {
    const { skip, take, page, limit } = this.paginationService.getSkipTake(query.page, query.limit);

    const where = {
      status: query.status,
      clientId: query.userId,
      instrumentId: query.instrumentId,
      side: query.side,
      totalAmount: {
        gte: query.amountFrom ? new Decimal(query.amountFrom) : undefined,
        lte: query.amountTo ? new Decimal(query.amountTo) : undefined,
      },
      createdAt:
        query.createdFrom || query.createdTo
          ? { gte: query.createdFrom ? new Date(query.createdFrom) : undefined, lte: query.createdTo ? new Date(query.createdTo) : undefined }
          : undefined,
      client: query.mobile
        ? {
            mobile: { contains: query.mobile, mode: 'insensitive' as const },
          }
        : undefined,
      OR: query.q
        ? [
            { id: query.q },
            { clientNote: { contains: query.q, mode: 'insensitive' as const } },
          ]
        : undefined,
    } as const;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.trade.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: tradeWithRelationsSelect,
      }),
      this.prisma.trade.count({ where }),
    ]);

    return this.paginationService.wrap(
      items.map((trade) => TradesMapper.toResponse(trade as unknown as TradeWithRelations)),
      total,
      page,
      limit,
    );
  }

  async findAdminDetail(id: string): Promise<AdminTradeDetailDto> {
    const trade = await this.prisma.trade.findUnique({ where: { id }, select: adminTradeSelect });
    if (!trade) {
      throw new NotFoundException('Trade not found');
    }

    const [attachments, outbox] = await this.prisma.$transaction([
      this.prisma.attachment.findMany({
        where: adminTradeAttachmentWhere(id),
        orderBy: { createdAt: 'asc' },
        include: { file: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, label: true, createdAt: true } } },
      }),
      this.prisma.tahesabOutbox.findFirst({
        where: { correlationId: id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return AdminTradesMapper.toDetail(
      trade,
      attachments.map((att) => ({
        id: att.id,
        fileId: att.fileId,
        purpose: att.purpose ?? null,
        createdAt: att.createdAt,
        file: att.file,
      })),
      outbox ?? undefined,
    );
  }

  async approve(id: string, dto: ApproveTradeDto, adminId: string) {
    const updatedTrade = (await runInTx(this.prisma, async (tx) => {
      const [locked] = await tx.$queryRaw<TradeWithRelations[]>`
        SELECT * FROM "Trade" WHERE id = ${id} FOR UPDATE
      `;
      if (!locked) throw new NotFoundException('Trade not found');

      const trade = await tx.trade.findUnique({ where: { id }, select: tradeWithRelationsSelect });
      if (!trade) throw new NotFoundException('Trade not found');

      if (trade.status !== TradeStatus.PENDING) {
        return trade as TradeWithRelations;
      }

      if (trade.settlementMethod !== SettlementMethod.WALLET) {
        throw new BadRequestException({
          code: 'NOT_IMPLEMENTED',
          message: 'Only wallet settlement is supported for trades',
        });
      }

      const quantity = new Decimal(trade.quantity);
      const total = new Decimal(trade.totalAmount);

      if (trade.side === TradeSide.BUY) {
        const consumedReservation = await this.accountsService.consumeFunds({
          userId: trade.clientId,
          instrumentCode: IRR_INSTRUMENT_CODE,
          refType: TxRefType.TRADE,
          refId: trade.id,
          tx,
        });

        const userIrrAccount =
          consumedReservation?.account ??
          (await this.accountsService.getOrCreateAccount(trade.clientId, IRR_INSTRUMENT_CODE, tx));

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

        const usable = this.accountsService.getUsableCapacity(userIrrAccount);
        if (usable.lt(total)) {
          throw new InsufficientCreditException('Insufficient IRR balance for trade approval');
        }

        await this.accountsService.applyTransaction(
          tx,
          userIrrAccount,
          total.negated(),
          AccountTxType.TRADE_DEBIT,
          TxRefType.TRADE,
          trade.id,
          adminId,
        );
        await this.accountsService.applyTransaction(
          tx,
          houseIrr,
          total,
          AccountTxType.TRADE_CREDIT,
          TxRefType.TRADE,
          trade.id,
          adminId,
        );
        await this.accountsService.applyTransaction(
          tx,
          userAsset,
          quantity,
          AccountTxType.TRADE_CREDIT,
          TxRefType.TRADE,
          trade.id,
          adminId,
        );
        await this.accountsService.applyTransaction(
          tx,
          houseAsset,
          quantity.negated(),
          AccountTxType.TRADE_DEBIT,
          TxRefType.TRADE,
          trade.id,
          adminId,
        );
      } else {
        const consumedReservation = await this.accountsService.consumeFunds({
          userId: trade.clientId,
          instrumentCode: trade.instrument.code,
          refType: TxRefType.TRADE,
          refId: trade.id,
          tx,
        });

        const userAsset =
          consumedReservation?.account ??
          (await this.accountsService.getOrCreateAccount(
            trade.clientId,
            trade.instrument.code,
            tx,
          ));
        const houseAsset = await this.accountsService.getOrCreateAccount(
          HOUSE_USER_ID,
          trade.instrument.code,
          tx,
        );
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

        const usableAsset = this.accountsService.getUsableCapacity(userAsset);
        if (usableAsset.lt(quantity)) {
          throw new InsufficientCreditException('Not enough asset to approve sell trade');
        }

        await this.accountsService.applyTransaction(
          tx,
          userAsset,
          quantity.negated(),
          AccountTxType.TRADE_DEBIT,
          TxRefType.TRADE,
          trade.id,
          adminId,
        );
        await this.accountsService.applyTransaction(
          tx,
          houseAsset,
          quantity,
          AccountTxType.TRADE_CREDIT,
          TxRefType.TRADE,
          trade.id,
          adminId,
        );
        await this.accountsService.applyTransaction(
          tx,
          userIrr,
          total,
          AccountTxType.TRADE_CREDIT,
          TxRefType.TRADE,
          trade.id,
          adminId,
        );
        await this.accountsService.applyTransaction(
          tx,
          houseIrr,
          total.negated(),
          AccountTxType.TRADE_DEBIT,
          TxRefType.TRADE,
          trade.id,
          adminId,
        );
      }

      await this.limitsService.consume({ refType: TxRefType.TRADE, refId: trade.id }, tx);

      return tx.trade.update({
        where: { id: trade.id },
        data: {
          status: TradeStatus.APPROVED,
          approvedAt: new Date(),
          approvedById: adminId,
          adminNote: dto.adminNote ?? trade.adminNote,
        },
        select: tradeWithRelationsSelect,
      });
    }, { logger: this.logger })) as TradeWithRelations;

    await this.enqueueTahesabForWalletTrade(updatedTrade);
    return TradesMapper.toResponse(updatedTrade);
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

  private async enqueueTahesabDeletionForTrade(tradeId: string, correlationId?: string): Promise<void> {
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
      { correlationId: correlationId ?? `spot:cancel:${tradeId}` },
    );
  }

  async settleForwardTradeInCash(tradeId: string, dto: SettleForwardCashDto, adminId?: string) {
    const updated = (await runInTx(this.prisma, async (tx) => {
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: tradeWithRelationsSelect,
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

          await this.accountsService.lockAccounts(tx, [userIrr.id, houseIrr.id]);

          if (amount.gt(0)) {
            const usable = this.accountsService.getUsableCapacity(userIrr);
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
            const usableHouse = this.accountsService.getUsableCapacity(houseIrr);
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
        select: tradeWithRelationsSelect,
      });

      return updatedTrade;
    }, { logger: this.logger })) as TradeWithRelations;

    await this.enqueueTahesabForForwardCashSettlement(updated);
    return TradesMapper.toResponse(updated);
  }

  async cancelTrade(tradeId: string, reason?: string) {
    const updated = (await runInTx(this.prisma, async (tx) => {
      const [locked] = await tx.$queryRaw<TradeWithRelations[]>`
        SELECT * FROM "Trade" WHERE id = ${tradeId} FOR UPDATE
      `;
      if (!locked) throw new NotFoundException('Trade not found');

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: tradeWithRelationsSelect,
      });
      if (!trade) throw new NotFoundException('Trade not found');

      if (
        trade.status === TradeStatus.CANCELLED_BY_ADMIN ||
        trade.status === TradeStatus.CANCELLED_BY_USER
      ) {
        return trade as TradeWithRelations;
      }
      if (trade.status !== TradeStatus.PENDING) {
        throw new ConflictException('Only PENDING trades can be cancelled');
      }

      await this.limitsService.release({ refType: TxRefType.TRADE, refId: trade.id }, tx);
      if (trade.settlementMethod === SettlementMethod.WALLET) {
        const instrumentCode = trade.side === TradeSide.BUY ? IRR_INSTRUMENT_CODE : trade.instrument.code;
        await this.accountsService.releaseFunds({
          userId: trade.clientId,
          instrumentCode,
          refType: TxRefType.TRADE,
          refId: trade.id,
          tx,
        });
      }

      return tx.trade.update({
        where: { id: trade.id },
        data: {
          status: TradeStatus.CANCELLED_BY_ADMIN,
          adminNote: reason ?? trade.adminNote,
          cancelledAt: new Date(),
        },
        select: tradeWithRelationsSelect,
      });
    }, { logger: this.logger })) as TradeWithRelations;

    await this.enqueueTahesabDeletionForTrade(tradeId, `spot:cancel:${tradeId}`);
    return TradesMapper.toResponse(updated);
  }

  async reverseTrade(tradeId: string, adminId?: string, reason?: string) {
    const reversed = (await runInTx(this.prisma, async (tx) => {
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: tradeWithRelationsSelect,
      });
      if (!trade) throw new NotFoundException('Trade not found');
      if (trade.reversedAt) return trade;
      if (trade.status !== TradeStatus.APPROVED) {
        throw new ConflictException('Only APPROVED trades can be reversed');
      }

      if (trade.settlementMethod === SettlementMethod.WALLET) {
        const tradeTxs = await tx.accountTx.findMany({
          where: { refType: TxRefType.TRADE, refId: trade.id },
          orderBy: { createdAt: 'asc' },
        });

        await this.accountsService.lockAccounts(tx, tradeTxs.map((txRecord) => txRecord.accountId));

        for (const txRecord of tradeTxs) {
          const existingReversal = await tx.accountTx.findFirst({ where: { reversalOfId: txRecord.id } });
          if (existingReversal) {
            continue;
          }

          await this.accountsService.applyTransaction(
            tx,
            { id: txRecord.accountId },
            new Decimal(txRecord.delta).negated(),
            AccountTxType.ADJUSTMENT,
            TxRefType.TRADE,
            trade.id,
            adminId,
            txRecord.id,
          );
        }
      }

      return tx.trade.update({
        where: { id: trade.id },
        data: {
          status: TradeStatus.CANCELLED_BY_ADMIN,
          reversedAt: new Date(),
          adminNote: reason ?? trade.adminNote,
        },
        select: tradeWithRelationsSelect,
      });
    }, { logger: this.logger })) as TradeWithRelations;

    await this.enqueueTahesabDeletionForTrade(tradeId, `trade:${tradeId}:reverse`);
    return TradesMapper.toResponse(reversed);
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
    const updated = (await runInTx(this.prisma, async (tx) => {
      const [locked] = await tx.$queryRaw<TradeWithRelations[]>`
        SELECT * FROM "Trade" WHERE id = ${id} FOR UPDATE
      `;
      if (!locked) throw new NotFoundException('Trade not found');

      const trade = await tx.trade.findUnique({ where: { id }, select: tradeWithRelationsSelect });
      if (!trade) throw new NotFoundException('Trade not found');

      if (trade.status === TradeStatus.REJECTED) {
        return trade as TradeWithRelations;
      }
      if (trade.status !== TradeStatus.PENDING) {
        throw new BadRequestException('Only PENDING trades can be rejected');
      }

      await this.limitsService.release({ refType: TxRefType.TRADE, refId: trade.id }, tx);

      if (trade.settlementMethod === SettlementMethod.WALLET) {
        const instrumentCode = trade.side === TradeSide.BUY ? IRR_INSTRUMENT_CODE : trade.instrument.code;
        await this.accountsService.releaseFunds({
          userId: trade.clientId,
          instrumentCode,
          refType: TxRefType.TRADE,
          refId: trade.id,
          tx,
        });
      }

      return tx.trade.update({
        where: { id },
        data: {
          status: TradeStatus.REJECTED,
          rejectedAt: new Date(),
          rejectReason: dto.rejectReason,
          adminNote: dto.rejectReason ?? undefined,
        },
        select: tradeWithRelationsSelect,
      });
    }, { logger: this.logger })) as TradeWithRelations;

    return TradesMapper.toResponse(updated as TradeWithRelations);
  }
}
