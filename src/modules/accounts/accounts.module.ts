import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountsController } from './accounts.controller';
import { UserSettingsModule } from '../user-settings/user-settings.module';

@Module({
  imports: [PrismaModule, UserSettingsModule],
  providers: [AccountsService],
  controllers: [AccountsController],
  exports: [AccountsService],
})
export class AccountsModule {}
