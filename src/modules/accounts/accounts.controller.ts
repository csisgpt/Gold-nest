import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { EffectiveSettingsService } from '../user-settings/effective-settings.service';
import { AccountsService } from './accounts.service';
import { HOUSE_USER_ID } from './constants';
import { AccountStatementFiltersDto } from './dto/account-statement-filters.dto';
import { mapWalletAccountDto } from './mappers/wallet-account.mapper';

@ApiTags('accounts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly effectiveSettingsService: EffectiveSettingsService,
  ) {}

  @Get('accounts/my')
  async listMy(@CurrentUser() user: JwtRequestUser) {
    const [accounts, settings] = await Promise.all([
      this.accountsService.getAccountsWithInstrument(user.id),
      this.effectiveSettingsService.getEffective(user.id),
    ]);

    return accounts.map((account) => mapWalletAccountDto(account, !settings.showBalances));
  }

  @Get('accounts/user/:userId')
  @Roles(UserRole.ADMIN)
  async listByUser(@Param('userId') userId: string) {
    const targetUserId = userId === 'house' ? HOUSE_USER_ID : userId;
    const accounts = await this.accountsService.getAccountsWithInstrument(targetUserId);
    return accounts.map((account) => mapWalletAccountDto(account, false));
  }

  @Get('accounts/statement')
  async getMyStatement(@CurrentUser() user: JwtRequestUser, @Query() filters: AccountStatementFiltersDto) {
    const entries = await this.accountsService.getStatementForUser(user.id, filters);
    const settings = await this.effectiveSettingsService.getEffective(user.id);
    if (!settings.showBalances) {
      return {
        ...entries,
        items: entries.items.map((entry) => ({
          ...entry,
          amountMoney: null,
          amountWeight: null,
          balancesHidden: true,
        })),
      };
    }
    return entries;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/accounts/:userId/statement')
  getUserStatement(@Param('userId') userId: string, @Query() filters: AccountStatementFiltersDto) {
    return this.accountsService.getStatementForUser(userId, filters);
  }
}
