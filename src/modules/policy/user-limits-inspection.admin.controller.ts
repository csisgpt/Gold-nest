import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PaginationService } from '../../common/pagination/pagination.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('admin-user-limits-inspection')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users/:id/limits')
export class UserLimitsInspectionAdminController {
  constructor(private readonly prisma: PrismaService, private readonly paginationService: PaginationService) {}

  @Get('usage')
  async usage(@Param('id') id: string, @Query() query: any) {
    const where: any = { userId: id };
    if (query.periodKey) where.periodKey = query.periodKey;
    if (query.action) where.action = query.action;
    if (query.metric) where.metric = query.metric;
    if (query.instrumentKey) where.instrumentKey = query.instrumentKey;

    const { page, limit, skip, take } = this.paginationService.getSkipTake(Number(query.page ?? 1), Number(query.limit ?? 20));
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.limitUsage.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } }),
      this.prisma.limitUsage.count({ where }),
    ]);

    return this.paginationService.wrap(items.map((i) => ({ ...i, usedAmount: i.usedAmount.toString(), reservedAmount: i.reservedAmount.toString() })), totalItems, page, limit);
  }

  @Get('reservations')
  async reservations(@Param('id') id: string, @Query() query: any) {
    const where: any = { userId: id };
    if (query.status) where.status = query.status;

    const { page, limit, skip, take } = this.paginationService.getSkipTake(Number(query.page ?? 1), Number(query.limit ?? 20));
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.limitReservation.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } }),
      this.prisma.limitReservation.count({ where }),
    ]);

    return this.paginationService.wrap(items.map((i) => ({ ...i, amount: i.amount.toString() })), totalItems, page, limit);
  }
}
