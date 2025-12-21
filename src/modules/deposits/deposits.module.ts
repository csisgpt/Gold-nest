import { Module } from '@nestjs/common';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountsModule } from '../accounts/accounts.module';
import { FilesModule } from '../files/files.module';
import { TahesabModule } from '../tahesab/tahesab.module';
import { PaginationModule } from '../../common/pagination/pagination.module';

@Module({
  imports: [PrismaModule, AccountsModule, FilesModule, TahesabModule, PaginationModule],
  controllers: [DepositsController],
  providers: [DepositsService],
  exports: [DepositsService],
})
export class DepositsModule {}
