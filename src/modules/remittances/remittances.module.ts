import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountsModule } from '../accounts/accounts.module';
import { RemittancesService } from './remittances.service';
import { RemittancesController } from './remittances.controller';

@Module({
  imports: [PrismaModule, AccountsModule],
  providers: [RemittancesService],
  controllers: [RemittancesController],
  exports: [RemittancesService],
})
export class RemittancesModule {}
