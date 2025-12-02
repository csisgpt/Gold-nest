import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
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
export class AppModule {}
