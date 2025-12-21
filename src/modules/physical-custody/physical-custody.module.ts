import { Module } from '@nestjs/common';
import { PhysicalCustodyService } from './physical-custody.service';
import { PhysicalCustodyController } from './physical-custody.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TahesabModule } from '../tahesab/tahesab.module';
import { AccountsModule } from '../accounts/accounts.module';
import { PolicyModule } from '../policy/policy.module';

@Module({
  imports: [PrismaModule, TahesabModule, AccountsModule, PolicyModule],
  controllers: [PhysicalCustodyController],
  providers: [PhysicalCustodyService],
  exports: [PhysicalCustodyService],
})
export class PhysicalCustodyModule {}
