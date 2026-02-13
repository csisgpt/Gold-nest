import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PolicyAuditEntityType, UserRole } from '@prisma/client';
import { ApiErrorCode } from '../../common/http/api-error-codes';
import { runInTx } from '../../common/db/tx.util';
import { PaginationService } from '../../common/pagination/pagination.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TahesabIntegrationConfigService } from '../tahesab/tahesab-integration.config';
import { TahesabOutboxService } from '../tahesab/tahesab-outbox.service';
import {
  GroupUsersQueryDto,
  MoveGroupUsersDto,
  UpsertCustomerGroupSettingsDto,
} from './dto/customer-group-settings.dto';
import { CreateCustomerGroupDto, UpdateCustomerGroupDto } from './dto/customer-group.dto';
import { adminGroupUserRowSelect, mapAdminGroupUserRow } from './mappers/admin-group-user-row.mapper';

@ApiTags('admin-customer-groups')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller()
export class CustomerGroupsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly tahesabOutbox: TahesabOutboxService,
    private readonly tahesabConfig: TahesabIntegrationConfigService,
  ) {}

  @Get('admin/customer-groups')
  list() {
    return this.prisma.customerGroup.findMany({ orderBy: { code: 'asc' } });
  }

  @Get('admin/customer-groups/paged')
  async listPaged(@Query('page') page = 1, @Query('limit') limit = 20, @Query('q') q?: string) {
    const where: any = {};
    if (q) {
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { tahesabGroupName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const { skip, take } = this.paginationService.getSkipTake(Number(page), Number(limit));
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.customerGroup.findMany({
        where,
        skip,
        take,
        include: { _count: { select: { users: true } } },
        orderBy: { code: 'asc' },
      }),
      this.prisma.customerGroup.count({ where }),
    ]);

    return this.paginationService.wrap(
      items.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        isDefault: item.isDefault,
        tahesabGroupName: item.tahesabGroupName,
        usersCount: item._count.users,
      })),
      totalItems,
      Number(page),
      Number(limit),
    );
  }

  @Post('admin/customer-groups')
  create(@Body() dto: CreateCustomerGroupDto, @CurrentUser() actor: JwtRequestUser) {
    return runInTx(this.prisma, async (tx) => {
      if (dto.isDefault) {
        await tx.customerGroup.updateMany({ data: { isDefault: false } });
      }

      const created = await tx.customerGroup.create({
        data: {
          code: dto.code,
          name: dto.name,
          tahesabGroupName: dto.tahesabGroupName,
          isDefault: dto.isDefault ?? false,
        },
      });

      await tx.policyAuditLog.create({
        data: {
          entityType: PolicyAuditEntityType.CUSTOMER_GROUP,
          entityId: created.id,
          actorId: actor.id,
          afterJson: created,
        },
      });

      return created;
    });
  }

  @Put('admin/customer-groups/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerGroupDto, @CurrentUser() actor: JwtRequestUser) {
    return runInTx(this.prisma, async (tx) => {
      const before = await tx.customerGroup.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException({ code: ApiErrorCode.GROUP_NOT_FOUND, message: 'Group not found' });
      }
      if (dto.isDefault) {
        await tx.customerGroup.updateMany({ data: { isDefault: false } });
      }

      const updated = await tx.customerGroup.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          tahesabGroupName: dto.tahesabGroupName,
          isDefault: dto.isDefault ?? undefined,
        },
      });

      await tx.policyAuditLog.create({
        data: {
          entityType: PolicyAuditEntityType.CUSTOMER_GROUP,
          entityId: id,
          actorId: actor.id,
          beforeJson: before,
          afterJson: updated,
        },
      });

      return updated;
    });
  }

  @Delete('admin/customer-groups/:id')
  async remove(@Param('id') id: string, @CurrentUser() actor: JwtRequestUser) {
    return runInTx(this.prisma, async (tx) => {
      const group = await tx.customerGroup.findUnique({ where: { id } });
      if (!group) {
        throw new NotFoundException({ code: ApiErrorCode.GROUP_NOT_FOUND, message: 'Group not found' });
      }
      if (group.isDefault) {
        throw new BadRequestException({ code: ApiErrorCode.GROUP_DEFAULT_CANNOT_DELETE, message: 'Default group cannot be deleted' });
      }

      const usersCount = await tx.user.count({ where: { customerGroupId: id } });
      if (usersCount > 0) {
        throw new BadRequestException({ code: ApiErrorCode.GROUP_HAS_USERS, message: 'Group has users; move them first' });
      }

      await tx.customerGroup.delete({ where: { id } });
      await tx.policyAuditLog.create({
        data: {
          entityType: PolicyAuditEntityType.CUSTOMER_GROUP,
          entityId: id,
          actorId: actor.id,
          beforeJson: group,
          reason: 'delete',
        },
      });
      return { deleted: true };
    });
  }

  @Get('admin/customer-groups/:id/settings')
  async getSettings(@Param('id') id: string) {
    return this.prisma.customerGroupSettings.findUnique({ where: { groupId: id } });
  }

  @Put('admin/customer-groups/:id/settings')
  async upsertSettings(
    @Param('id') id: string,
    @Body() dto: UpsertCustomerGroupSettingsDto,
    @CurrentUser() actor: JwtRequestUser,
  ) {
    return runInTx(this.prisma, async (tx) => {
      const before = await tx.customerGroupSettings.findUnique({ where: { groupId: id } });
      const updated = await tx.customerGroupSettings.upsert({
        where: { groupId: id },
        create: { groupId: id, ...dto },
        update: dto,
      });
      await tx.policyAuditLog.create({
        data: {
          entityType: PolicyAuditEntityType.CUSTOMER_GROUP_SETTINGS,
          entityId: id,
          actorId: actor.id,
          beforeJson: before,
          afterJson: updated,
        },
      });
      return updated;
    });
  }

  @Get('admin/customer-groups/:id/users')
  async listUsers(@Param('id') id: string, @Query() query: GroupUsersQueryDto) {
    const where: any = { customerGroupId: id };
    if (query.q) {
      where.OR = [
        { fullName: { contains: query.q, mode: 'insensitive' } },
        { mobile: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { id: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const { page, limit, skip, take } = this.paginationService.getSkipTake(query.page, query.limit);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, skip, take, select: adminGroupUserRowSelect, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count({ where }),
    ]);

    return this.paginationService.wrap(items.map(mapAdminGroupUserRow), totalItems, page, limit);
  }

  @Post('admin/customer-groups/:id/users:move')
  async moveUsers(@Param('id') id: string, @Body() dto: MoveGroupUsersDto, @CurrentUser() actor: JwtRequestUser) {
    const toGroup = await this.prisma.customerGroup.findUnique({ where: { id: dto.toGroupId } });
    if (!toGroup) {
      throw new NotFoundException({ code: ApiErrorCode.GROUP_NOT_FOUND, message: 'Group not found' });
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: dto.userIds }, customerGroupId: id },
      include: { customerGroup: true },
    });

    const moved = await this.prisma.user.updateMany({
      where: { id: { in: users.map((u) => u.id) }, customerGroupId: id },
      data: { customerGroupId: dto.toGroupId },
    });

    await this.prisma.policyAuditLog.create({
      data: {
        entityType: PolicyAuditEntityType.CUSTOMER_GROUP,
        entityId: id,
        actorId: actor.id,
        reason: JSON.stringify({ fromGroupId: id, toGroupId: dto.toGroupId, userIds: users.map((u) => u.id), movedCount: moved.count }),
        afterJson: { fromGroupId: id, toGroupId: dto.toGroupId, userIds: users.map((u) => u.id), movedCount: moved.count },
      },
    });

    if (this.tahesabConfig.isEnabled()) {
      for (const user of users) {
        if (!user.tahesabCustomerCode) continue;
        await this.tahesabOutbox.enqueue(
          'DoEditMoshtari',
          {
            moshtariCode: user.tahesabCustomerCode,
            name: user.fullName,
            groupName: toGroup.tahesabGroupName ?? toGroup.code ?? 'DEFAULT',
            tel: user.mobile,
            address: '',
            nationalCode: '',
            description: '',
          },
          { correlationId: `customer:resync:${user.id}:${new Date().toISOString()}` },
        );
      }
    }

    return { moved: moved.count };
  }
}
