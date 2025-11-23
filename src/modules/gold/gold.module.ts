import { Module } from '@nestjs/common';
import { GoldService } from './gold.service';
import { GoldController } from './gold.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountsModule } from '../accounts/accounts.module';
import { FilesModule } from '../files/files.module';
import { InstrumentsModule } from '../instruments/instruments.module';

@Module({
  imports: [PrismaModule, AccountsModule, FilesModule, InstrumentsModule],
  providers: [GoldService],
  controllers: [GoldController],
})
export class GoldModule {}
