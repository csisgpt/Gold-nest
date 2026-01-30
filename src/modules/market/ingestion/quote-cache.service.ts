import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../infra/redis/redis.service';
import { QUOTE_INDEX_KEY, QUOTE_KEY_PREFIX, PUBSUB_CHANNELS } from './constants';
import { QuoteStatus } from './quote-resolver.service';

export interface CanonicalQuote {
  productId: string;
  code: string;
  displayName: string;
  productType: string;
  tradeType: string;
  unitType: string;
  baseBuy?: number;
  baseSell?: number;
  displayBuy?: number;
  displaySell?: number;
  source?: {
    type: 'OVERRIDE' | 'PROVIDER';
    providerKey?: string;
    overrideId?: string;
  };
  status: QuoteStatus;
  asOf: string;
  updatedAt: string;
  cacheMiss?: boolean;
}

@Injectable()
export class QuoteCacheService {
  private readonly logger = new Logger(QuoteCacheService.name);

  constructor(private readonly redis: RedisService) { }

  private keyFor(productId: string): string {
    return `${QUOTE_KEY_PREFIX}${productId}`;
  }

  async setQuote(productId: string, quote: CanonicalQuote, ttlSec?: number): Promise<void> {
    // if (!this.redis.isEnabled()) {
    //   this.logger.warn('Redis disabled, skipping setQuote');
    //   return;
    // }
    await this.redis.setJson(this.keyFor(productId), quote, ttlSec);
  }

  async getQuote(productId: string): Promise<CanonicalQuote | null> {
    // if (!this.redis.isEnabled()) return null;
    return this.redis.getJson<CanonicalQuote>(this.keyFor(productId));
  }

  async getQuotes(productIds: string[]): Promise<(CanonicalQuote | null)[]> {
    return null
    // if (!this.redis.isEnabled()) return productIds.map(() => null);
    // const client = this.redis.get(),;
    // const pipeline = client.multi();
    // for (const pid of productIds) {
    //   pipeline.get(this.keyFor(pid));
    // }
    // const res = await pipeline.exec();
    // return res.map(([, value]) => (value ? (JSON.parse(value as string) as CanonicalQuote) : null));
  }

  async publishUpdate(productId: string, asOf: string, status: QuoteStatus): Promise<void> {
    // if (!this.redis.isEnabled()) return;
    await this.redis.publish(PUBSUB_CHANNELS.QUOTE_UPDATED, { productId, asOf, status });
  }

  async refreshIndex(activeProductIds: string[]): Promise<void> {
    // if (!this.redis.isEnabled()) return;
    await this.redis.setJson(QUOTE_INDEX_KEY, activeProductIds);
  }

  async getIndex(): Promise<string[] | null> {
    // if (!this.redis.isEnabled()) return null;
    return this.redis.getJson<string[]>(QUOTE_INDEX_KEY);
  }
}
