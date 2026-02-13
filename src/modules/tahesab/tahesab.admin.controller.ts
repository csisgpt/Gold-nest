import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ApiErrorCode } from '../../common/http/api-error-codes';
import { PaginationService } from '../../common/pagination/pagination.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ListOutboxDto } from './dto/list-outbox.dto';
import { GroupResyncMode, ResyncGroupUsersDto } from './dto/resync-group-users.dto';
import { TahesabIntegrationConfigService } from './tahesab-integration.config';
import { TahesabOutboxService } from './tahesab-outbox.service';

@ApiTags('admin-tahesab')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/tahesab')
export class TahesabAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly outbox: TahesabOutboxService,
    private readonly tahesabConfig: TahesabIntegrationConfigService,
  ) {}

  @Get('outbox')
  async listOutbox(@Query() query: ListOutboxDto) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.method) where.method = query.method;
    if (query.correlationId) where.correlationId = { contains: query.correlationId, mode: 'insensitive' };
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const { page, limit, skip, take } = this.paginationService.getSkipTake(query.page, query.limit);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.tahesabOutbox.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.tahesabOutbox.count({ where }),
    ]);

    return this.paginationService.wrap(items, totalItems, page, limit);
  }

  @Post('outbox/:id/retry')
  retryOutbox(@Param('id') id: string) {
    return this.prisma.tahesabOutbox.update({
      where: { id },
      data: { status: 'PENDING', nextRetryAt: new Date(), lastError: null },
    });
  }

  @Post('users/:id/resync')
  async resyncUser(@Param('id') id: string) {
    if (!this.tahesabConfig.isEnabled()) {
      throw new BadRequestException({ code: ApiErrorCode.TAHESAB_DISABLED, message: 'Tahesab integration disabled' });
    }

    const user = await this.prisma.user.findUnique({ where: { id }, include: { customerGroup: true } });
    if (!user) {
      throw new NotFoundException({ code: ApiErrorCode.USER_NOT_FOUND, message: 'User not found' });
    }
    if (!user.tahesabCustomerCode) {
      throw new BadRequestException({ code: ApiErrorCode.TAHESAB_CUSTOMER_CODE_REQUIRED, message: 'Tahesab customer code required' });
    }

    await this.outbox.enqueue(
      'DoEditMoshtari',
      {
        moshtariCode: user.tahesabCustomerCode,
        name: user.fullName,
        groupName: user.customerGroup?.tahesabGroupName ?? user.customerGroup?.code ?? 'DEFAULT',
        tel: user.mobile,
        address: '',
        nationalCode: '',
        description: '',
      },
      { correlationId: `customer:resync:${user.id}:${new Date().toISOString()}` },
    );

    return { queued: true };
  }

  @Post('customer-groups/:groupId/resync-users')
  async resyncGroupUsers(@Param('groupId') groupId: string, @Body() body: ResyncGroupUsersDto) {
    if (!this.tahesabConfig.isEnabled()) {
      throw new BadRequestException({ code: ApiErrorCode.TAHESAB_DISABLED, message: 'Tahesab integration disabled' });
    }

    const group = await this.prisma.customerGroup.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException({ code: ApiErrorCode.GROUP_NOT_FOUND, message: 'Group not found' });
    }

    const where: any = { customerGroupId: groupId };
    if (body.userIds?.length) {
      where.id = { in: body.userIds };
    }
    if (body.mode === GroupResyncMode.ONLY_LINKED) {
      where.tahesabCustomerCode = { not: null };
    }

    const users = await this.prisma.user.findMany({ where });
    let queued = 0;

    for (const user of users) {
      if (!user.tahesabCustomerCode) continue;
      await this.outbox.enqueue(
        'DoEditMoshtari',
        {
          moshtariCode: user.tahesabCustomerCode,
          name: user.fullName,
          groupName: group.tahesabGroupName ?? group.code ?? 'DEFAULT',
          tel: user.mobile,
          address: '',
          nationalCode: '',
          description: '',
        },
        { correlationId: `customer:resync:${user.id}:${new Date().toISOString()}` },
      );
      queued += 1;
    }

    return { queued };
  }
}
