import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PolicyAuditEntityType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateCustomerGroupDto, UpdateCustomerGroupDto } from './dto/customer-group.dto';
import { runInTx } from '../../common/db/tx.util';
import {
  GroupUsersQueryDto,
  MoveGroupUsersDto,
  UpsertCustomerGroupSettingsDto,
} from './dto/customer-group-settings.dto';
import { PaginationService } from '../../common/pagination/pagination.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';

@ApiTags('admin-customer-groups')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller()
export class CustomerGroupsAdminController {
  constructor(private readonly prisma: PrismaService, private readonly paginationService: PaginationService) {}

  @Get('admin/customer-groups')
  list() {
    return this.prisma.customerGroup.findMany({ orderBy: { code: 'asc' } });
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
  async remove(@Param('id') id: string) {
    const group = await this.prisma.customerGroup.findUnique({ where: { id } });
    if (!group) throw new Error('GROUP_NOT_FOUND');
    if (group.isDefault) throw new Error('GROUP_DEFAULT_CANNOT_DELETE');

    const usersCount = await this.prisma.user.count({ where: { customerGroupId: id } });
    if (usersCount > 0) throw new Error('GROUP_HAS_USERS');

    await this.prisma.customerGroup.delete({ where: { id } });
    return { deleted: true };
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
      this.prisma.user.findMany({ where, skip, take, include: { userKyc: true, customerGroup: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count({ where }),
    ]);

    return this.paginationService.wrap(items, totalItems, page, limit);
  }

  @Post('admin/customer-groups/:id/users:move')
  async moveUsers(@Param('id') id: string, @Body() dto: MoveGroupUsersDto) {
    const moved = await this.prisma.user.updateMany({
      where: { id: { in: dto.userIds }, customerGroupId: id },
      data: { customerGroupId: dto.toGroupId },
    });
    return { moved: moved.count };
  }
}
