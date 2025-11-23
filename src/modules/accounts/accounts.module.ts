import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountsController } from './accounts.controller';

@Module({
  imports: [PrismaModule],
  providers: [AccountsService],
  controllers: [AccountsController],
  exports: [AccountsService],
})
export class AccountsModule {}
