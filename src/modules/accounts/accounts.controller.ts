import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { AccountsService } from './accounts.service';
import { AccountStatementFiltersDto } from './dto/account-statement-filters.dto';
import { HOUSE_USER_ID } from './constants';
import { EffectiveSettingsService } from '../user-settings/effective-settings.service';

@ApiTags('accounts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly effectiveSettingsService: EffectiveSettingsService,
  ) {}

  @Get('accounts/my')
  async listMy(@CurrentUser() user: JwtRequestUser) {
    const [accounts, settings] = await Promise.all([
      this.prisma.account.findMany({
        where: { userId: user.id },
        include: { instrument: true },
      }),
      this.effectiveSettingsService.getEffective(user.id),
    ]);

    if (!settings.showBalances) {
      return accounts.map((account) => ({
        ...account,
        balance: null,
        blockedBalance: null,
        minBalance: null,
        balancesHidden: true,
      }));
    }

    return accounts;
  }

  @Get('accounts/user/:userId')
  @Roles(UserRole.ADMIN)
  async listByUser(@Param('userId') userId: string) {
    // Simple read-only endpoint to inspect balances per user. House accounts can be queried with userId set to 'house'.
    if (userId === 'house') {
      return this.prisma.account.findMany({ where: { userId: HOUSE_USER_ID }, include: { instrument: true } });
    }
    return this.prisma.account.findMany({ where: { userId }, include: { instrument: true } });
  }

  @Get('accounts/statement')
  async getMyStatement(
    @CurrentUser() user: JwtRequestUser,
    @Query() filters: AccountStatementFiltersDto,
  ) {
    const entries = await this.accountsService.getStatementForUser(user.id, filters);
    const settings = await this.effectiveSettingsService.getEffective(user.id);
    if (!settings.showBalances) {
      return {
        ...entries,
        items: entries.items.map((entry) => ({
          ...entry,
          creditMoney: null,
          debitMoney: null,
          creditWeight: null,
          debitWeight: null,
          balancesHidden: true,
        })),
      };
    }
    return entries;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/accounts/:userId/statement')
  getUserStatement(
    @Param('userId') userId: string,
    @Query() filters: AccountStatementFiltersDto,
  ) {
    return this.accountsService.getStatementForUser(userId, filters);
  }
}
