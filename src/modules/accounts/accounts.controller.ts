import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('accounts')
@ApiBearerAuth('access-token')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('user/:userId')
  async listByUser(@Param('userId') userId: string) {
    // Simple read-only endpoint to inspect balances per user. House accounts can be queried with userId set to 'house'.
    if (userId === 'house') {
      return this.prisma.account.findMany({ where: { userId: null }, include: { instrument: true } });
    }
    return this.prisma.account.findMany({ where: { userId }, include: { instrument: true } });
  }
}
