import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketProductType, PolicyMetric, TradeSide } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QuoteCacheService, CanonicalQuote } from '../ingestion/quote-cache.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { UserSettingsService } from '../../user-settings/user-settings.service';

export interface LockedQuotePayload {
  quoteId: string;
  userId: string;
  productId: string;
  productCode: string;
  side: TradeSide;
  metric: PolicyMetric;
  baseInstrumentId: string;
  baseInstrumentCode: string;
  baseBuy?: number;
  baseSell?: number;
  displayBuy?: number;
  displaySell?: number;
  executablePrice: number;
  source?: CanonicalQuote['source'];
  asOf: string;
  expiresAt: string;
  createdAt: string;
  nonce?: string;
}

interface ConsumeResult {
  status: 'OK' | 'NOT_FOUND' | 'ALREADY_CONSUMED';
  payload?: LockedQuotePayload;
}

@Injectable()
export class QuoteLockService {
  private readonly lockTtlSec: number;
  private readonly consumedTtlSec: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: QuoteCacheService,
    private readonly redis: RedisService,
    private readonly userSettingsService: UserSettingsService,
    configService: ConfigService,
  ) {
    this.lockTtlSec = Number(configService.get<string>('QUOTE_LOCK_TTL_SEC') ?? '10');
    this.consumedTtlSec = Number(configService.get<string>('QUOTE_LOCK_CONSUMED_TTL_SEC') ?? '60');
  }

  private ensureRedis(): void {
    if (!this.redis.isEnabled()) {
      throw new ServiceUnavailableException({
        code: 'REDIS_DISABLED',
        message: 'Quote locking requires Redis',
      });
    }
  }

  private lockKey(quoteId: string): string {
    return `quoteLock:${quoteId}`;
  }

  private consumedKey(quoteId: string): string {
    return `quoteLock:consumed:${quoteId}`;
  }

  private pointerKey(userId: string, productId: string, side: TradeSide): string {
    return `quoteLock:user:${userId}:${productId}:${side}`;
  }

  private assertExecutable(quote: CanonicalQuote | null): void {
    if (!quote || quote.status === 'NO_PRICE') {
      throw new ConflictException({ code: 'NO_EXECUTABLE_QUOTE', message: 'No executable quote available' });
    }
    if (quote.status === 'STALE') {
      throw new ConflictException({ code: 'QUOTE_STALE', message: 'Quote is stale' });
    }
  }

  private async getExistingLockId(userId: string, productId: string, side: TradeSide): Promise<string | null> {
    const client = this.redis.getCommandClient();
    return client.get(this.pointerKey(userId, productId, side));
  }

  private getExecutablePrice(quote: CanonicalQuote, side: TradeSide): number {
    const price = side === TradeSide.BUY ? quote.displayBuy : quote.displaySell;
    if (price == null) {
      throw new ConflictException({ code: 'NO_EXECUTABLE_QUOTE', message: 'Executable price missing for side' });
    }
    return price;
  }

  private async saveAudit(payload: LockedQuotePayload): Promise<void> {
    await this.prisma.quoteLockAudit.create({
      data: {
        quoteId: payload.quoteId,
        userId: payload.userId,
        productId: payload.productId,
        side: payload.side,
        metric: payload.metric,
        baseInstrumentId: payload.baseInstrumentId,
        baseInstrumentCode: payload.baseInstrumentCode,
        displayBuy: payload.displayBuy,
        displaySell: payload.displaySell,
        baseBuy: payload.baseBuy,
        baseSell: payload.baseSell,
        sourceType: payload.source?.type as any,
        sourceProviderKey: payload.source?.providerKey,
        sourceOverrideId: payload.source?.overrideId,
        asOf: new Date(payload.asOf),
        expiresAt: new Date(payload.expiresAt),
      },
    });
  }

  async lockQuote(params: {
    userId: string;
    productId: string;
    side: TradeSide;
    forceNew?: boolean;
  }): Promise<LockedQuotePayload> {
    this.ensureRedis();
    const { userId, productId, side } = params;

    const settings = await this.userSettingsService.getForUser(userId);
    const product = await this.prisma.marketProduct.findUnique({
      where: { id: productId },
      include: { baseInstrument: true },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException({ code: 'MARKET_PRODUCT_NOT_FOUND', message: 'Market product not found or inactive' });
    }
    const hiddenTypes: MarketProductType[] = [];
    if (!settings.showGold) hiddenTypes.push(MarketProductType.GOLD);
    if (!settings.showCoins) hiddenTypes.push(MarketProductType.COIN);
    if (!settings.showCash) hiddenTypes.push(MarketProductType.CASH);
    if (hiddenTypes.includes(product.productType)) {
      throw new ForbiddenException({ code: 'MARKET_PRODUCT_HIDDEN', message: 'Not available for this user' });
    }

    const existingLockId = !params.forceNew
      ? await this.getExistingLockId(userId, productId, side)
      : null;
    if (existingLockId) {
      const reuse = await this.redis.getJson<LockedQuotePayload>(this.lockKey(existingLockId));
      if (reuse) {
        return reuse;
      }
    }

    const quote = await this.cache.getQuote(productId);
    this.assertExecutable(quote);
    const executablePrice = this.getExecutablePrice(quote!, side);

    const quoteId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.lockTtlSec * 1000);

    const payload: LockedQuotePayload = {
      quoteId,
      userId,
      productId,
      productCode: product.code,
      side,
      metric: product.unitType,
      baseInstrumentId: product.baseInstrumentId,
      baseInstrumentCode: product.baseInstrument.code,
      baseBuy: quote?.baseBuy,
      baseSell: quote?.baseSell,
      displayBuy: quote?.displayBuy,
      displaySell: quote?.displaySell,
      executablePrice,
      source: quote?.source,
      asOf: quote?.asOf ?? new Date().toISOString(),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      nonce: randomUUID(),
    };

    const client = this.redis.getCommandClient();
    await Promise.all([
      this.redis.setJson(this.lockKey(quoteId), payload, this.lockTtlSec),
      client.set(this.pointerKey(userId, productId, side), quoteId, 'EX', this.lockTtlSec),
    ]);

    await this.saveAudit(payload);

    return payload;
  }

  async getLockForUser(quoteId: string, userId: string): Promise<LockedQuotePayload> {
    this.ensureRedis();
    const payload = await this.redis.getJson<LockedQuotePayload>(this.lockKey(quoteId));
    if (!payload) {
      throw new NotFoundException({ code: 'QUOTE_LOCK_EXPIRED', message: 'Quote lock expired or not found' });
    }
    if (payload.userId !== userId) {
      throw new ForbiddenException({ code: 'QUOTE_LOCK_FORBIDDEN', message: 'Quote lock does not belong to user' });
    }
    const consumed = await this.redis.getCommandClient().exists(this.consumedKey(quoteId));
    if (consumed) {
      throw new ConflictException({ code: 'QUOTE_LOCK_ALREADY_USED', message: 'Quote lock already consumed' });
    }
    return payload;
  }

  private async evalConsume(quoteId: string): Promise<ConsumeResult> {
    this.ensureRedis();
    const client = this.redis.getCommandClient();
    const script = `
      local payload = redis.call('GET', KEYS[1])
      if not payload then return {'NOT_FOUND'} end
      if redis.call('EXISTS', KEYS[2]) == 1 then return {'ALREADY_CONSUMED'} end
      local ttl = redis.call('TTL', KEYS[1])
      local expire = tonumber(ARGV[1])
      if ttl and ttl > 0 and ttl < expire then expire = ttl end
      redis.call('SET', KEYS[2], '1', 'EX', expire)
      return {'OK', payload}
    `;
    const res = (await client.eval(script, 2, this.lockKey(quoteId), this.consumedKey(quoteId), this.consumedTtlSec)) as
      | [string]
      | [string, string];
    if (!Array.isArray(res) || res.length === 0) {
      return { status: 'NOT_FOUND' };
    }
    if (res[0] === 'OK') {
      return { status: 'OK', payload: JSON.parse(res[1]) as LockedQuotePayload };
    }
    return { status: res[0] as ConsumeResult['status'] };
  }

  async consumeLock(quoteId: string): Promise<LockedQuotePayload> {
    const result = await this.evalConsume(quoteId);
    if (result.status === 'NOT_FOUND') {
      throw new ConflictException({ code: 'QUOTE_LOCK_EXPIRED', message: 'Quote lock expired' });
    }
    if (result.status === 'ALREADY_CONSUMED') {
      throw new ConflictException({ code: 'QUOTE_LOCK_ALREADY_USED', message: 'Quote already used' });
    }
    return result.payload!;
  }

  async markConsumed(quoteId: string, tradeId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.quoteLockAudit.updateMany({
      where: { quoteId },
      data: { consumedAt: new Date(), tradeId },
    });
  }
}
