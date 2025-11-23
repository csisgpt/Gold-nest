import { Module } from '@nestjs/common';
import { TradesService } from './trades.service';
import { TradesController } from './trades.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountsModule } from '../accounts/accounts.module';
import { FilesModule } from '../files/files.module';
import { InstrumentsModule } from '../instruments/instruments.module';

@Module({
  imports: [PrismaModule, AccountsModule, FilesModule, InstrumentsModule],
  providers: [TradesService],
  controllers: [TradesController],
})
export class TradesModule {}
