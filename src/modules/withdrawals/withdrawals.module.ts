import { Module } from '@nestjs/common';
import { WithdrawalsController } from './withdrawals.controller';
import { WithdrawalsService } from './withdrawals.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountsModule } from '../accounts/accounts.module';
import { FilesModule } from '../files/files.module';
import { TahesabModule } from '../tahesab/tahesab.module';
import { PaginationModule } from '../../common/pagination/pagination.module';
import { PolicyModule } from '../policy/policy.module';

@Module({
  imports: [PrismaModule, AccountsModule, FilesModule, TahesabModule, PaginationModule, PolicyModule],
  controllers: [WithdrawalsController],
  providers: [WithdrawalsService],
  exports: [WithdrawalsService],
})
export class WithdrawalsModule {}
