import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
  ],
})
export class AppModule {}
