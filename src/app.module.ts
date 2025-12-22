import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { UsersModule } from './modules/users/users.module';
import { DepositsModule } from './modules/deposits/deposits.module';
import { WithdrawalsModule } from './modules/withdrawals/withdrawals.module';
import { TradesModule } from './modules/trades/trades.module';
import { GoldModule } from './modules/gold/gold.module';
import { FilesModule } from './modules/files/files.module';
import { AdminModule } from './modules/admin/admin.module';
import { InstrumentsModule } from './modules/instruments/instruments.module';
import { AuthModule } from './modules/auth/auth.module';
import { RemittancesModule } from './modules/remittances/remittances.module';
import { AppController } from './app.controller';
import { TahesabModule } from './modules/tahesab/tahesab.module';
import { PhysicalCustodyModule } from './modules/physical-custody/physical-custody.module';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { PolicyModule } from './modules/policy/policy.module';
import { RedisModule } from './infra/redis/redis.module';
import { MarketProductsModule } from './modules/market-products/market-products.module';
import { PriceProvidersModule } from './modules/price-providers/price-providers.module';
import { ProductProviderMappingsModule } from './modules/product-provider-mappings/product-provider-mappings.module';
import { PriceOverridesModule } from './modules/price-overrides/price-overrides.module';
import { UserSettingsModule } from './modules/user-settings/user-settings.module';
import { MarketModule } from './modules/market/market.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ScheduleModule.forRoot(),
    AccountsModule,
    UsersModule,
    DepositsModule,
    WithdrawalsModule,
    TradesModule,
    GoldModule,
    FilesModule,
    AdminModule,
    InstrumentsModule,
    RemittancesModule,
    AuthModule,
    TahesabModule,
    PhysicalCustodyModule,
    AttachmentsModule,
    PolicyModule,
    MarketProductsModule,
    PriceProvidersModule,
    ProductProviderMappingsModule,
    PriceOverridesModule,
    UserSettingsModule,
    MarketModule,
    RedisModule,
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 60,
    }),
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
