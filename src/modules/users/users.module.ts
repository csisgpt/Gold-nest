import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TahesabModule } from '../tahesab/tahesab.module';
import { FoundationController } from './foundation.controller';
import { PaginationModule } from '../../common/pagination/pagination.module';
import { FoundationContextService } from './foundation-context.service';
import { UserSettingsModule } from '../user-settings/user-settings.module';
import { AccountsModule } from '../accounts/accounts.module';
import { PolicyModule } from '../policy/policy.module';

@Module({
  imports: [PrismaModule, TahesabModule, PaginationModule, UserSettingsModule, AccountsModule, PolicyModule],
  providers: [UsersService, FoundationContextService],
  exports: [UsersService, FoundationContextService],
  controllers: [UsersController, FoundationController],
})
export class UsersModule {}
