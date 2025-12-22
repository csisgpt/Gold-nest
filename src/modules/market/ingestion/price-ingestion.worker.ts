import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { QuoteResolverService } from './quote-resolver.service';
import { QuoteCacheService } from './quote-cache.service';
import { INGESTION_LOCK_KEY, LAST_TICK_KEY } from './constants';
import { RedisService } from '../../../infra/redis/redis.service';

@Injectable()
export class PriceIngestionWorker {
  private readonly logger = new Logger(PriceIngestionWorker.name);
  private readonly pollIntervalSec: number;
  private readonly boardTtlSec: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: QuoteResolverService,
    private readonly cache: QuoteCacheService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.pollIntervalSec = Number(this.configService.get<string>('PRICE_POLL_INTERVAL_SEC') ?? '10');
    this.boardTtlSec = Number(this.configService.get<string>('BOARD_TTL_SEC') ?? '15');
  }

  async acquireLock(): Promise<boolean> {
    if (!this.redis.isEnabled()) return false;
    const ttl = Math.max(this.pollIntervalSec - 1, 1);
    return this.redis.setIfNotExists(INGESTION_LOCK_KEY, '1', ttl);
  }

  @Interval(10_000)
  async handleTick(): Promise<void> {
    if (!this.redis.isEnabled()) {
      this.logger.warn('Redis disabled, skipping price ingestion');
      return;
    }
    const acquired = await this.acquireLock();
    if (!acquired) {
      this.logger.debug('Another instance holds ingestion lock, skipping tick');
      return;
    }

    const started = Date.now();
    const products = await this.prisma.marketProduct.findMany({
      where: { isActive: true },
      orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }],
    });
    if (products.length === 0) return;
    const productIds = products.map((p) => p.id);

    const [mappings, overrides] = await Promise.all([
      this.prisma.productProviderMapping.findMany({
        where: { productId: { in: productIds }, isEnabled: true },
        orderBy: [{ productId: 'asc' }, { priority: 'asc' }],
        include: { provider: { select: { key: true } } },
      }),
      this.prisma.adminPriceOverride.findMany({
        where: { productId: { in: productIds }, isActive: true, expiresAt: { gt: new Date() } },
      }),
    ]);

    const mappingsByProduct = new Map<string, typeof mappings>();
    for (const m of mappings) {
      const list = mappingsByProduct.get(m.productId) ?? [];
      list.push(m);
      mappingsByProduct.set(m.productId, list);
    }
    const overridesByProduct = new Map<string, typeof overrides>();
    for (const o of overrides) {
      overridesByProduct.set(o.productId, o);
    }

    let ok = 0;
    let stale = 0;
    let noPrice = 0;

    for (const product of products) {
      const resolved = await this.resolver.resolve(
        product,
        mappingsByProduct.get(product.id) ?? [],
        overridesByProduct.get(product.id),
      );

      if (resolved.status === 'OK') ok++;
      else if (resolved.status === 'STALE') stale++;
      else noPrice++;

      await this.cache.setQuote(product.id, resolved, this.boardTtlSec);
      await this.cache.publishUpdate(product.id, resolved.asOf, resolved.status);
    }

    await this.cache.refreshIndex(productIds);
    if (this.redis.isEnabled()) {
      await this.redis.setJson(LAST_TICK_KEY, { at: new Date().toISOString(), ok, stale, noPrice });
    }

    const duration = Date.now() - started;
    this.logger.log(
      `Price ingestion tick processed ${products.length} products: ok=${ok} stale=${stale} noPrice=${noPrice} durationMs=${duration}`,
    );
  }
}
