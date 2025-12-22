import { Module } from '@nestjs/common';
import { TradesService } from './trades.service';
import { TradesController } from './trades.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountsModule } from '../accounts/accounts.module';
import { FilesModule } from '../files/files.module';
import { InstrumentsModule } from '../instruments/instruments.module';
import { TahesabModule } from '../tahesab/tahesab.module';
import { PaginationModule } from '../../common/pagination/pagination.module';
import { PolicyModule } from '../policy/policy.module';
import { UserSettingsModule } from '../user-settings/user-settings.module';
import { TradeAccessGuard } from './guards/trade-access.guard';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [
    PrismaModule,
    AccountsModule,
    FilesModule,
    InstrumentsModule,
    TahesabModule,
    PaginationModule,
    PolicyModule,
    UserSettingsModule,
    MarketModule,
  ],
  providers: [TradesService, TradeAccessGuard],
  controllers: [TradesController],
})
export class TradesModule {}
