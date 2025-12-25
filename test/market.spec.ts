import 'reflect-metadata';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { test } from 'node:test';
import {
  MarketProductType,
  PolicyMetric,
  PricingOverrideMode,
  TradeType,
  UserRole,
} from '@prisma/client';
import { PriceIngestionWorker } from '../src/modules/market/ingestion/price-ingestion.worker';
import { QuoteResolverService } from '../src/modules/market/ingestion/quote-resolver.service';
import { ProviderRegistryService } from '../src/modules/market/providers/provider-registry.service';
import { PricingEngineService } from '../src/modules/market/ingestion/pricing-engine.service';
import { MarketQuotesService } from '../src/modules/market/quotes/market-quotes.service';
import { QuoteCacheService } from '../src/modules/market/ingestion/quote-cache.service';
import { PriceProvider, ProviderQuote } from '../src/modules/market/providers/price-provider.interface';
import { NotFoundException } from '@nestjs/common';
import { RolesGuard } from '../src/modules/auth/roles.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { MarketQuotesController } from '../src/modules/market/quotes/market-quotes.controller';

class FakeRedis {
  locked = false;
  payloads: any[] = [];
  isEnabled() {
    return true;
  }
  async setIfNotExists(_key: string, _value: any, _ttl: number) {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }
  async setJson(_key: string, _value: any) {
    this.payloads.push(_value);
  }
  async publish() {}
  async getJson() { return null; }
  getCommandClient() {
    return {
      multi: () => ({
        get: () => {},
        exec: async () => [],
      }),
    } as any;
  }
}

class FakeConfig {
  get() {
    return 0;
  }
}

class NullCache extends QuoteCacheService {
  constructor() {
    super(new FakeRedis() as any);
  }
}

test('ingestion lock only allows first worker', async () => {
  const redis = new FakeRedis();
  const worker = new PriceIngestionWorker({} as any, {} as any, {} as any, redis as any, { get: () => '10' } as any);
  const first = await worker.acquireLock();
  const second = await worker.acquireLock();
  strictEqual(first, true);
  strictEqual(second, false);
});

test('resolver prefers admin override over providers', async () => {
  const registry = new ProviderRegistryService();
  class NullProvider implements PriceProvider {
    key = 'NULL';
    supportsBulk = false;
    async fetchOne(): Promise<ProviderQuote | null> { return null; }
  }
  registry.register(new NullProvider());
  const resolver = new QuoteResolverService(registry, new PricingEngineService(new FakeConfig() as any));
  const product: any = {
    id: 'p1',
    code: 'G',
    displayName: 'Gold',
    productType: MarketProductType.GOLD,
    tradeType: TradeType.SPOT,
    unitType: PolicyMetric.COUNT,
  };
  const override: any = {
    id: 'o1',
    isActive: true,
    expiresAt: new Date(Date.now() + 10000),
    revokedAt: null,
    mode: PricingOverrideMode.ABSOLUTE,
    buyAbsolute: 10,
    sellAbsolute: 11,
  };
  const result = await resolver.resolve(product, [{ id: 'm1', productId: 'p1', providerId: 'NULL' } as any], override);
  strictEqual(result.status, 'OK');
  strictEqual(result.source?.type, 'OVERRIDE');
});

test('absolute override wins with correct values', async () => {
  const resolver = new QuoteResolverService(new ProviderRegistryService(), new PricingEngineService(new FakeConfig() as any));
  const product: any = {
    id: 'p1',
    code: 'G',
    displayName: 'Gold',
    productType: MarketProductType.GOLD,
    tradeType: TradeType.SPOT,
    unitType: PolicyMetric.COUNT,
  };
  const override: any = {
    id: 'o1',
    isActive: true,
    expiresAt: new Date(Date.now() + 10000),
    startsAt: new Date(Date.now() - 1000),
    revokedAt: null,
    mode: PricingOverrideMode.ABSOLUTE,
    buyAbsolute: 50,
    sellAbsolute: 60,
  };
  const resolved = await resolver.resolve(product, [], override);
  strictEqual(resolved.baseBuy, 50);
  strictEqual(resolved.baseSell, 60);
  strictEqual(resolved.source?.overrideId, 'o1');
});

test('delta bps override adjusts provider quote', async () => {
  const registry = new ProviderRegistryService();
  class BaseProvider implements PriceProvider {
    key = 'BASE';
    supportsBulk = false;
    async fetchOne(): Promise<ProviderQuote | null> {
      return { productId: 'p1', providerKey: 'BASE', providerSymbol: 'X', asOf: new Date(), buy: 100, sell: 200, raw: {} };
    }
  }
  registry.register(new BaseProvider());
  const resolver = new QuoteResolverService(registry, new PricingEngineService(new FakeConfig() as any));
  const product: any = {
    id: 'p1',
    code: 'G',
    displayName: 'Gold',
    productType: MarketProductType.GOLD,
    tradeType: TradeType.SPOT,
    unitType: PolicyMetric.COUNT,
  };
  const override: any = {
    id: 'o1',
    isActive: true,
    expiresAt: new Date(Date.now() + 10000),
    startsAt: new Date(Date.now() - 1000),
    revokedAt: null,
    mode: PricingOverrideMode.DELTA_BPS,
    buyDeltaBps: 100,
    sellDeltaBps: -50,
  };
  const resolved = await resolver.resolve(product, [{ id: 'm1', productId: 'p1', providerId: 'BASE' } as any], override);
  strictEqual(Math.round((resolved.baseBuy ?? 0) * 100) / 100, 101);
  strictEqual(Math.round((resolved.baseSell ?? 0) * 100) / 100, 199);
});

test('override window respected for future or expired overrides', async () => {
  const registry = new ProviderRegistryService();
  class BaseProvider implements PriceProvider {
    key = 'BASE';
    supportsBulk = false;
    async fetchOne(): Promise<ProviderQuote | null> {
      return { productId: 'p1', providerKey: 'BASE', providerSymbol: 'X', asOf: new Date(), buy: 10, sell: 12, raw: {} };
    }
  }
  registry.register(new BaseProvider());
  const resolver = new QuoteResolverService(registry, new PricingEngineService(new FakeConfig() as any));
  const product: any = {
    id: 'p1',
    code: 'G',
    displayName: 'Gold',
    productType: MarketProductType.GOLD,
    tradeType: TradeType.SPOT,
    unitType: PolicyMetric.COUNT,
  };
  const futureOverride: any = {
    id: 'o1',
    isActive: true,
    startsAt: new Date(Date.now() + 60_000),
    expiresAt: new Date(Date.now() + 120_000),
    revokedAt: null,
    mode: PricingOverrideMode.ABSOLUTE,
    buyAbsolute: 1,
    sellAbsolute: 1,
  };
  const expiredOverride: any = {
    id: 'o2',
    isActive: true,
    startsAt: new Date(Date.now() - 120_000),
    expiresAt: new Date(Date.now() - 60_000),
    revokedAt: null,
    mode: PricingOverrideMode.ABSOLUTE,
    buyAbsolute: 1,
    sellAbsolute: 1,
  };
  const withFuture = await resolver.resolve(product, [{ id: 'm1', productId: 'p1', providerId: 'BASE' } as any], futureOverride);
  strictEqual(withFuture.source?.type, 'PROVIDER');
  const withExpired = await resolver.resolve(product, [{ id: 'm1', productId: 'p1', providerId: 'BASE' } as any], expiredOverride);
  strictEqual(withExpired.source?.type, 'PROVIDER');
});

test('quote listing respects user settings', async () => {
  const cache = new NullCache();
  const prisma = {
    marketProduct: {
      findMany: async () => [
        { id: 'cash1', code: 'C1', displayName: 'Cash', productType: MarketProductType.CASH, tradeType: TradeType.SPOT, unitType: PolicyMetric.COUNT, groupKey: 'A', sortOrder: 1 },
        { id: 'coin1', code: 'CO1', displayName: 'Coin', productType: MarketProductType.COIN, tradeType: TradeType.SPOT, unitType: PolicyMetric.COUNT, groupKey: 'A', sortOrder: 2 },
      ],
    },
  } as any;
  const userSettings = {
    getForUser: async () => ({ showGold: true, showCoins: false, showCash: true }),
  } as any;
  const service = new MarketQuotesService(prisma, cache, userSettings);
  const res = await service.listForUser('user1');
  const groupItems = res.groups.flatMap((g) => g.items.map((i) => i.productId));
  deepStrictEqual(groupItems, ['cash1']);
});

test('visibility helper hides coin when disabled', () => {
  const service = new MarketQuotesService({} as any, new NullCache(), { getForUser: async () => ({}) } as any);
  const visible = service.isVisible(MarketProductType.COIN, { showGold: true, showCash: true, showCoins: false });
  strictEqual(visible, false);
});

test('status endpoint requires admin role metadata', () => {
  const roles =
    Reflect.getMetadata('roles', MarketQuotesController.prototype.status) ??
    Reflect.getMetadata('roles', MarketQuotesController.prototype, 'status');
  const guards =
    (Reflect.getMetadata(GUARDS_METADATA, MarketQuotesController.prototype.status) as any[]) ??
    (Reflect.getMetadata(GUARDS_METADATA, MarketQuotesController.prototype, 'status') as any[]) ??
    (Reflect.getMetadata(GUARDS_METADATA, MarketQuotesController) as any[]);
  const guardNames = Array.isArray(guards) ? guards.map((g) => (typeof g === 'function' ? g.name : '') ) : [];
  strictEqual(Array.isArray(roles) && roles.includes(UserRole.ADMIN), true);
  strictEqual(guardNames.some((name) => name.toLowerCase().includes('roles')), true);
});

test('getOne throws NotFoundException when product missing', async () => {
  const cache = new NullCache();
  const prisma = {
    marketProduct: {
      findUnique: async () => null,
    },
  } as any;
  const service = new MarketQuotesService(prisma, cache, { getForUser: async () => ({ showGold: true, showCoins: true, showCash: true }) } as any);
  try {
    await service.getOne('user', 'missing');
    strictEqual(true, false);
  } catch (err) {
    strictEqual(err instanceof NotFoundException, true);
    const response = (err as NotFoundException).getResponse() as any;
    strictEqual(response.code, 'MARKET_PRODUCT_NOT_FOUND');
  }
});
