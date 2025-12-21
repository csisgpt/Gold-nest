import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountsModule } from '../accounts/accounts.module';
import { RemittancesService } from './remittances.service';
import { RemittancesController } from './remittances.controller';
import { TahesabModule } from '../tahesab/tahesab.module';
import { PolicyModule } from '../policy/policy.module';
import { PaginationModule } from '../../common/pagination/pagination.module';

@Module({
  imports: [PrismaModule, AccountsModule, TahesabModule, PolicyModule, PaginationModule],
  providers: [RemittancesService],
  controllers: [RemittancesController],
  exports: [RemittancesService],
})
export class RemittancesModule {}
