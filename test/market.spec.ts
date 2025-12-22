import { strictEqual, deepStrictEqual } from 'node:assert';
import { test } from 'node:test';
import { MarketProductType, PolicyMetric, TradeType } from '@prisma/client';
import { PriceIngestionWorker } from '../src/modules/market/ingestion/price-ingestion.worker';
import { QuoteResolverService } from '../src/modules/market/ingestion/quote-resolver.service';
import { ProviderRegistryService } from '../src/modules/market/providers/provider-registry.service';
import { PricingEngineService } from '../src/modules/market/ingestion/pricing-engine.service';
import { MarketQuotesService } from '../src/modules/market/quotes/market-quotes.service';
import { QuoteCacheService } from '../src/modules/market/ingestion/quote-cache.service';
import { PriceProvider, ProviderQuote } from '../src/modules/market/providers/price-provider.interface';

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
    buyAbsolute: 10,
    sellAbsolute: 11,
  };
  const result = await resolver.resolve(product, [{ id: 'm1', productId: 'p1', providerId: 'NULL' } as any], override);
  strictEqual(result.status, 'OK');
  strictEqual(result.source?.type, 'OVERRIDE');
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
