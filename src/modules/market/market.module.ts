import { Module } from '@nestjs/common';
import { MarketQuotesController } from './quotes/market-quotes.controller';
import { MarketQuotesService } from './quotes/market-quotes.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QuoteResolverService } from './ingestion/quote-resolver.service';
import { PriceIngestionWorker } from './ingestion/price-ingestion.worker';
import { QuoteCacheService } from './ingestion/quote-cache.service';
import { ProviderRegistryService } from './providers/provider-registry.service';
import { ManualProvider } from './providers/impl/manual-provider';
import { StubProvider } from './providers/impl/stub-provider';
import { PricingEngineService } from './ingestion/pricing-engine.service';
import { RedisModule } from '../../infra/redis/redis.module';
import { UserSettingsModule } from '../user-settings/user-settings.module';
import { QuoteLockService } from './quotes/quote-lock.service';

@Module({
  imports: [PrismaModule, RedisModule, UserSettingsModule],
  controllers: [MarketQuotesController],
  providers: [
    MarketQuotesService,
    QuoteResolverService,
    PriceIngestionWorker,
    QuoteCacheService,
    QuoteLockService,
    ProviderRegistryService,
    ManualProvider,
    StubProvider,
    PricingEngineService,
  ],
  exports: [QuoteLockService],
})
export class MarketModule {
  constructor(
    registry: ProviderRegistryService,
    manual: ManualProvider,
    stub: StubProvider,
  ) {
    registry.register(manual);
    registry.register(stub);
  }
}
