import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import {
  InstrumentType,
  InstrumentUnit,
  PolicyMetric,
  SettlementMethod,
  TradeSide,
  TradeType,
} from '@prisma/client';
import { QuoteLockService } from '../src/modules/market/quotes/quote-lock.service';
import { TradesService } from '../src/modules/trades/trades.service';
import { CreateTradeDto } from '../src/modules/trades/dto/create-trade.dto';
import { PolicyViolationException } from '../src/common/exceptions/policy-violation.exception';

class FakeRedisService {
  private store = new Map<string, string>();
  private expiry = new Map<string, number>();

  isEnabled() {
    return true;
  }

  private prune(key: string) {
    const exp = this.expiry.get(key);
    if (exp && Date.now() > exp) {
      this.store.delete(key);
      this.expiry.delete(key);
    }
  }

  getCommandClient() {
    return {
      get: async (key: string) => {
        this.prune(key);
        return this.store.get(key) ?? null;
      },
      set: async (key: string, value: string, mode?: string, ttlFlag?: string | number, ttl?: number) => {
        this.store.set(key, value);
        const ttlValue = typeof ttlFlag === 'number' ? ttlFlag : typeof ttl === 'number' ? ttl : undefined;
        if (ttlValue) {
          this.expiry.set(key, Date.now() + ttlValue * 1000);
        }
      },
      exists: async (key: string) => {
        this.prune(key);
        return this.store.has(key) ? 1 : 0;
      },
      eval: async (
        _script: string,
        _keys: number,
        key1: string,
        key2: string,
        _nowMs: number,
        expectedUserId: string,
        expire: number,
      ) => {
        this.prune(key1);
        this.prune(key2);
        const payload = this.store.get(key1);
        if (!payload) return ['NOT_FOUND'];
        const decoded = JSON.parse(payload);
        if (expectedUserId && decoded.userId !== expectedUserId) return ['FORBIDDEN'];
        if (this.store.has(key2)) return ['ALREADY_CONSUMED'];
        this.store.set(key2, '1');
        this.expiry.set(key2, Date.now() + expire * 1000);
        return ['OK', payload];
      },
    } as any;
  }

  async getJson<T>(key: string): Promise<T | null> {
    this.prune(key);
    const raw = this.store.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson(key: string, value: any, ttlSec?: number): Promise<void> {
    this.store.set(key, JSON.stringify(value));
    if (ttlSec) {
      this.expiry.set(key, Date.now() + ttlSec * 1000);
    }
  }
}

class StubQuoteCacheService {
  constructor(private readonly quotes: Record<string, any>) {}
  async getQuote(productId: string) {
    return this.quotes[productId] ?? null;
  }
}

class StubUserSettingsService {
  async getForUser() {
    return { showGold: true, showCoins: true, showCash: true };
  }
}

class StubConfig {
  constructor(private readonly values: Record<string, string> = {}) {}
  get(key: string) {
    return this.values[key];
  }
}

class InMemoryPrisma {
  marketProducts: any[];
  instruments: any[];
  trades: any[] = [];
  audits: any[] = [];

  constructor(products: any[], instruments: any[]) {
    this.marketProducts = products;
    this.instruments = instruments;
  }

  marketProduct = {
    findUnique: async ({ where, include }: any) => {
      const prod = this.marketProducts.find((p) => p.id === where.id);
      if (!prod) return null;
      if (include?.baseInstrument) {
        const instrument = this.instruments.find((i) => i.id === prod.baseInstrumentId);
        return { ...prod, baseInstrument: instrument };
      }
      return prod;
    },
    findFirst: async ({ where, orderBy }: any) => {
      const filtered = this.marketProducts.filter((p) => !where?.baseInstrumentId || p.baseInstrumentId === where.baseInstrumentId);
      const prod = orderBy ? filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] : filtered[0];
      return prod ?? null;
    },
  };

  instrument = {
    findUnique: async ({ where }: any) => {
      if (where.id) return this.instruments.find((i) => i.id === where.id) ?? null;
      if (where.code) return this.instruments.find((i) => i.code === where.code) ?? null;
      return null;
    },
  };

  quoteLockAudit = {
    create: async ({ data }: any) => {
      const record = { ...data, createdAt: data.createdAt ?? new Date() };
      this.audits.push(record);
      return record;
    },
    updateMany: async ({ where, data }: any) => {
      this.audits.filter((a) => a.quoteId === where.quoteId).forEach((audit) => Object.assign(audit, data));
    },
  };

  trade = {
    findFirst: async ({ where }: any) => {
      return this.trades.find(
        (t) =>
          t.clientId === where.clientId &&
          (where.idempotencyKey ? t.idempotencyKey === where.idempotencyKey : true) &&
          (where.quoteId ? t.quoteId === where.quoteId : true),
      );
    },
    create: async ({ data }: any) => {
      const record = {
        ...data,
        id: data.id ?? `trade-${this.trades.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.trades.push(record);
      return record;
    },
    findUnique: async ({ where }: any) => {
      const found = this.trades.find((t) => t.id === where.id);
      if (!found) return null;
      const instrument = this.instruments.find((i) => i.id === found.instrumentId);
      return {
        ...found,
        client: {
          id: found.clientId,
          fullName: 'User',
          mobile: '000',
          email: 'u@example.com',
          role: 'CLIENT',
          status: 'ACTIVE',
          tahesabCustomerCode: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        approvedBy: null,
        instrument,
      } as any;
    },
  };

  $transaction = async (fn: any) => fn(this as any);
}

class StubLimitsService {
  reservations: any[] = [];
  constructor(private readonly rejectAbove?: Decimal) {}
  async reserve(params: any) {
    if (this.rejectAbove && new Decimal(params.amount).gt(this.rejectAbove)) {
      throw new PolicyViolationException('LIMIT_EXCEEDED', 'Limit exceeded');
    }
    this.reservations.push(params);
  }
}

class StubAccountsService {
  reserves: any[] = [];
  async reserveFunds(params: any) {
    this.reserves.push(params);
  }
}

const noop = async () => {};

function baseServices() {
  const instrument = {
    id: 'inst-1',
    code: 'GOLD',
    name: 'Gold',
    type: InstrumentType.GOLD,
    unit: InstrumentUnit.GRAM_750_EQ,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const product = {
    id: 'prod-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    code: 'GOLD_PROD',
    displayName: 'Gold',
    productType: 'GOLD',
    tradeType: TradeType.SPOT,
    baseInstrumentId: instrument.id,
    unitType: PolicyMetric.WEIGHT_750_G,
    groupKey: 'G',
    sortOrder: 0,
    isActive: true,
    metaJson: null,
  };
  const prisma = new InMemoryPrisma([product], [instrument]);
  const redis = new FakeRedisService();
  const cache = new StubQuoteCacheService({
    [product.id]: {
      productId: product.id,
      code: product.code,
      displayName: product.displayName,
      productType: product.productType,
      tradeType: product.tradeType,
      unitType: product.unitType,
      status: 'OK',
      displayBuy: 100,
      displaySell: 90,
      baseBuy: 95,
      baseSell: 85,
      asOf: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: { type: 'PROVIDER', providerKey: 'stub' },
    },
  });
  const quoteLock = new QuoteLockService(prisma as any, cache as any, redis as any, new StubUserSettingsService() as any, new StubConfig() as any);
  return { instrument, product, prisma, redis, cache, quoteLock };
}

function tradeServiceDeps(prisma: any, quoteLock: QuoteLockService, limits: StubLimitsService, accounts: StubAccountsService) {
  const files = { createAttachmentsForActor: noop } as any;
  const instrumentsService = {} as any;
  const tahesabOutbox = {} as any;
  const tahesabIntegration = {} as any;
  const pagination = { getSkipTake: () => ({ skip: 0, take: 10, page: 1, limit: 10 }) } as any;
  return new TradesService(
    prisma as any,
    accounts as any,
    limits as any,
    files,
    instrumentsService,
    tahesabOutbox,
    tahesabIntegration,
    pagination,
    quoteLock,
  );
}

function tradeDto(quoteId: string, side: TradeSide = TradeSide.BUY): CreateTradeDto {
  return {
    quoteId,
    side,
    settlementMethod: SettlementMethod.WALLET,
    quantity: '1',
    pricePerUnit: undefined,
    instrumentCode: undefined,
  } as any;
}

test('T1: lock quote success returns executable price and quoteId', async () => {
  const { quoteLock, product } = baseServices();
  const locked = await quoteLock.lockQuote({ userId: 'u1', productId: product.id, side: TradeSide.BUY });
  assert.ok(locked.quoteId);
  assert.equal(locked.executablePrice, 100);
});

test('T2: lock rejects stale or missing quotes', async () => {
  const { product, redis, prisma } = baseServices();
  const cache = new StubQuoteCacheService({
    [product.id]: { status: 'NO_PRICE', productId: product.id, asOf: new Date().toISOString(), updatedAt: new Date().toISOString() },
  });
  const quoteLock = new QuoteLockService(prisma as any, cache as any, redis as any, new StubUserSettingsService() as any, new StubConfig() as any);
  await assert.rejects(() => quoteLock.lockQuote({ userId: 'u1', productId: product.id, side: TradeSide.BUY }), ConflictException);

  const staleCache = new StubQuoteCacheService({
    [product.id]: { status: 'STALE', productId: product.id, asOf: new Date().toISOString(), updatedAt: new Date().toISOString() },
  });
  const staleLock = new QuoteLockService(prisma as any, staleCache as any, redis as any, new StubUserSettingsService() as any, new StubConfig() as any);
  await assert.rejects(() => staleLock.lockQuote({ userId: 'u1', productId: product.id, side: TradeSide.SELL }), ConflictException);
});

test('T3: trade creation consumes lock and prevents reuse', async () => {
  const deps = baseServices();
  const limits = new StubLimitsService();
  const accounts = new StubAccountsService();
  const trades = tradeServiceDeps(deps.prisma, deps.quoteLock, limits, accounts);

  const lock = await deps.quoteLock.lockQuote({ userId: 'u1', productId: deps.product.id, side: TradeSide.BUY });
  const created = await trades.createForUser({ id: 'u1', role: 'CLIENT' } as any, tradeDto(lock.quoteId));
  assert.equal(created?.quoteId, lock.quoteId);

  await assert.rejects(() => trades.createForUser({ id: 'u1', role: 'CLIENT' } as any, tradeDto(lock.quoteId)), ConflictException);
});

test('T4: quote lock cannot be used by another user', async () => {
  const deps = baseServices();
  const trades = tradeServiceDeps(deps.prisma, deps.quoteLock, new StubLimitsService(), new StubAccountsService());
  const lock = await deps.quoteLock.lockQuote({ userId: 'u1', productId: deps.product.id, side: TradeSide.BUY });
  await assert.rejects(
    () => trades.createForUser({ id: 'u2', role: 'CLIENT' } as any, tradeDto(lock.quoteId)),
    ForbiddenException,
  );
});

test('T5: attacker cannot consume another user lock before owner uses it', async () => {
  const deps = baseServices();
  const trades = tradeServiceDeps(deps.prisma, deps.quoteLock, new StubLimitsService(), new StubAccountsService());
  const lock = await deps.quoteLock.lockQuote({ userId: 'u1', productId: deps.product.id, side: TradeSide.BUY });

  await assert.rejects(
    () => trades.createForUser({ id: 'u2', role: 'CLIENT' } as any, tradeDto(lock.quoteId)),
    ForbiddenException,
  );

  const created = await trades.createForUser({ id: 'u1', role: 'CLIENT' } as any, tradeDto(lock.quoteId));
  assert.equal(created?.quoteId, lock.quoteId);
});

test('T6: limits integration blocks oversized trades', async () => {
  const deps = baseServices();
  const limits = new StubLimitsService(new Decimal(50));
  const trades = tradeServiceDeps(deps.prisma, deps.quoteLock, limits, new StubAccountsService());
  const lock = await deps.quoteLock.lockQuote({ userId: 'u1', productId: deps.product.id, side: TradeSide.BUY });
  await assert.rejects(
    () => trades.createForUser({ id: 'u1', role: 'CLIENT' } as any, tradeDto(lock.quoteId)),
    PolicyViolationException,
  );
});
