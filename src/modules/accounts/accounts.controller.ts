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

@ApiTags('accounts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  @Get('accounts/user/:userId')
  async listByUser(@Param('userId') userId: string) {
    // Simple read-only endpoint to inspect balances per user. House accounts can be queried with userId set to 'house'.
    if (userId === 'house') {
      return this.prisma.account.findMany({ where: { userId: null }, include: { instrument: true } });
    }
    return this.prisma.account.findMany({ where: { userId }, include: { instrument: true } });
  }

  @Get('accounts/statement')
  getMyStatement(
    @CurrentUser() user: JwtRequestUser,
    @Query() filters: AccountStatementFiltersDto,
  ) {
    return this.accountsService.getStatementForUser(user.id, filters);
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
