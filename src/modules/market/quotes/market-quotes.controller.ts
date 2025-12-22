import { Controller, Get, Param, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { MarketQuotesService } from './market-quotes.service';
import { MarketQuotesResponseDto, MarketQuoteItemDto } from './dto/market-quote-item.dto';
import { CurrentUser } from '../../auth/current-user.decorator';
import { QuoteCacheService } from '../ingestion/quote-cache.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { PUBSUB_CHANNELS, LAST_TICK_KEY } from '../ingestion/constants';
import { UserSettingsService } from '../../user-settings/user-settings.service';
import { MarketProductType, UserRole } from '@prisma/client';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

interface StreamMessage {
  data: any;
}

@ApiTags('market-quotes')
@Controller()
export class MarketQuotesController {
  constructor(
    private readonly quotesService: MarketQuotesService,
    private readonly cache: QuoteCacheService,
    private readonly redis: RedisService,
    private readonly userSettingsService: UserSettingsService,
  ) {}

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('market/quotes')
  list(@CurrentUser() user: any): Promise<{ ok: true; result: MarketQuotesResponseDto }> {
    return this.quotesService.listForUser(user.sub).then((result) => ({ ok: true, result }));
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('market/quotes/:productId')
  async getOne(@Param('productId') productId: string, @CurrentUser() user: any): Promise<{ ok: true; result: MarketQuoteItemDto }> {
    const result = await this.quotesService.getOne(user.sub, productId);
    return { ok: true, result };
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Sse('market/quotes/stream')
  sse(@CurrentUser() user: any): Observable<StreamMessage> {
    const userId = user.sub;
    const settingsPromise = this.userSettingsService.getForUser(userId);
    return new Observable<StreamMessage>((subscriber) => {
      let disposed = false;
      const heartbeat = setInterval(() => {
        subscriber.next({ data: { type: 'ping', at: new Date().toISOString() } });
      }, 20_000);
      const setup = async () => {
        const settings = await settingsPromise;
        const unsubscribe = await this.redis.subscribe(PUBSUB_CHANNELS.QUOTE_UPDATED, async (payload) => {
          if (disposed) return;
          const quote = await this.cache.getQuote(payload.productId);
          if (!quote) return;
          if (!this.quotesService.isVisible(quote.productType as MarketProductType, settings)) return;
          subscriber.next({ data: quote });
        });
        return unsubscribe;
      };
      let unsubscribeFn: (() => Promise<void>) | null = null;
      setup()
        .then((unsub) => {
          unsubscribeFn = unsub;
        })
        .catch((err) => subscriber.error(err));
      return async () => {
        disposed = true;
        clearInterval(heartbeat);
        if (unsubscribeFn) await unsubscribeFn();
      };
    });
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/market/quotes/status')
  async status(): Promise<any> {
    const index = (await this.cache.getIndex()) ?? [];
    const quotes = await this.cache.getQuotes(index);
    let ok = 0;
    let stale = 0;
    let noPrice = 0;
    for (const q of quotes) {
      if (!q) {
        noPrice++;
        continue;
      }
      if (q.status === 'OK') ok++;
      else if (q.status === 'STALE') stale++;
      else noPrice++;
    }
    const last = await this.redis.getJson<{ at: string }>(LAST_TICK_KEY);
    return { ok: true, result: { activeProducts: index.length, ok, stale, noPrice, lastTickAt: last?.at ?? null } };
  }
}
