import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AttachmentEntityType, KycLevel, PolicyAuditEntityType, UserRole, UserStatus } from '@prisma/client';
import { PaginationService } from '../../common/pagination/pagination.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { EffectiveSettingsService } from '../user-settings/effective-settings.service';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { FoundationContextService } from './foundation-context.service';
import { AccountsService } from '../accounts/accounts.service';

class AdminUpdateUserDto {
  fullName?: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
  customerGroupId?: string | null;
  tahesabCustomerCode?: string | null;
}

class SubmitKycDto {
  levelRequested?: KycLevel;
  note?: string;
  fileIds?: string[];
}

@ApiTags('foundation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class FoundationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly foundationContext: FoundationContextService,
    private readonly effectiveSettings: EffectiveSettingsService,
    private readonly accountsService: AccountsService,
  ) {}

  @Get('me/overview')
  async getMeOverview(@CurrentUser() user: JwtRequestUser) {
    const ctx = await this.foundationContext.getUserContext(user.id);
    const wallet = await this.foundationContext.getWalletSummary(user.id);
    const policy = await this.foundationContext.getPolicySummary(user.id);
    const capabilities = await this.foundationContext.getCapabilities(user.id);

    const fullUser = await this.prisma.user.findUnique({ where: { id: user.id }, include: { customerGroup: true } });

    return {
      user: {
        id: fullUser?.id,
        fullName: fullUser?.fullName,
        mobile: fullUser?.mobile,
        email: fullUser?.email,
        role: fullUser?.role,
        status: fullUser?.status,
        customerGroup: fullUser?.customerGroup
          ? { id: fullUser.customerGroup.id, code: fullUser.customerGroup.code, name: fullUser.customerGroup.name }
          : null,
        tahesabCustomerCode: fullUser?.tahesabCustomerCode ?? null,
      },
      kyc: ctx.kyc,
      settings: ctx.settings,
      wallet,
      policy: { summary: policy },
      capabilities,
    };
  }

  @Get('me/kyc')
  getMeKyc(@CurrentUser() user: JwtRequestUser) {
    return this.prisma.userKyc.findUnique({ where: { userId: user.id } });
  }

  @Post('me/kyc/submit')
  async submitKyc(@CurrentUser() user: JwtRequestUser, @Body() body: SubmitKycDto) {
    const existing = await this.prisma.userKyc.findUnique({ where: { userId: user.id } });
    const requestedLevel = body.levelRequested ?? KycLevel.BASIC;

    if (existing?.status === 'VERIFIED' && (existing.level === requestedLevel || existing.level === KycLevel.FULL)) {
      throw new Error('KYC_ALREADY_VERIFIED');
    }

    const updated = await this.prisma.userKyc.upsert({
      where: { userId: user.id },
      create: { userId: user.id, status: 'PENDING', level: requestedLevel },
      update: { status: 'PENDING', level: requestedLevel },
    });

    if (body.fileIds?.length) {
      await this.prisma.attachment.createMany({
        data: body.fileIds.map((fileId) => ({
          fileId,
          entityType: AttachmentEntityType.KYC,
          entityId: user.id,
          purpose: body.note,
        })),
      });
    }

    await this.prisma.policyAuditLog.create({
      data: {
        entityType: PolicyAuditEntityType.USER_KYC,
        entityId: user.id,
        actorId: user.id,
        beforeJson: existing,
        afterJson: updated,
        reason: body.note,
      },
    });

    return updated;
  }

  @Get('me/policy/summary')
  getMyPolicySummary(@CurrentUser() user: JwtRequestUser) {
    return this.foundationContext.getPolicySummary(user.id);
  }

  @Get('admin/users')
  @Roles(UserRole.ADMIN)
  async listAdminUsers(@Query() query: AdminUsersQueryDto) {
    const where: any = {};
    if (query.q) {
      where.OR = [
        { fullName: { contains: query.q, mode: 'insensitive' } },
        { mobile: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { id: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.role) where.role = query.role;
    if (query.customerGroupId) where.customerGroupId = query.customerGroupId;
    if (query.tahesabLinked === true) where.tahesabCustomerCode = { not: null };
    if (query.tahesabLinked === false) where.tahesabCustomerCode = null;
    if (query.kycStatus || query.kycLevel) {
      where.userKyc = {};
      if (query.kycStatus) where.userKyc.status = query.kycStatus;
      if (query.kycLevel) where.userKyc.level = query.kycLevel;
    }

    const { page, limit, skip, take } = this.paginationService.getSkipTake(query.page, query.limit);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        include: { customerGroup: true, userKyc: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return this.paginationService.wrap(
      items.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        mobile: u.mobile,
        email: u.email,
        role: u.role,
        status: u.status,
        customerGroup: u.customerGroup ? { id: u.customerGroup.id, code: u.customerGroup.code, name: u.customerGroup.name } : null,
        kyc: u.userKyc,
        tahesabCustomerCode: u.tahesabCustomerCode,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      totalItems,
      page,
      limit,
    );
  }

  @Get('admin/users/:id/overview')
  @Roles(UserRole.ADMIN)
  async getAdminUserOverview(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { customerGroup: true, userKyc: true } });
    const settings = await this.effectiveSettings.getEffectiveWithSources(id);
    const wallet = await this.foundationContext.getWalletSummary(id, true);
    const policy = await this.foundationContext.getPolicySummary(id);
    const outbox = await this.prisma.tahesabOutbox.findFirst({ where: { correlationId: { contains: id } }, orderBy: { createdAt: 'desc' } });

    return {
      user,
      settings,
      wallet: {
        balancesHiddenByUserSetting: !settings.effective.showBalances,
        balancesForAdmin: wallet,
      },
      policy: { summary: policy },
      tahesab: {
        customerCode: user?.tahesabCustomerCode ?? null,
        groupName: user?.customerGroup?.tahesabGroupName ?? null,
        lastOutbox: outbox,
      },
    };
  }

  @Patch('admin/users/:id')
  @Roles(UserRole.ADMIN)
  async patchAdminUser(@Param('id') id: string, @Body() dto: AdminUpdateUserDto, @CurrentUser() actor: JwtRequestUser) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new Error('USER_NOT_FOUND');

    if (before.status === UserStatus.ACTIVE && dto.status === UserStatus.PENDING_APPROVAL) {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName ?? undefined,
        email: dto.email ?? undefined,
        role: dto.role ?? undefined,
        status: dto.status ?? undefined,
        customerGroupId: dto.customerGroupId ?? undefined,
        tahesabCustomerCode: dto.tahesabCustomerCode ?? undefined,
      },
    });

    await this.prisma.policyAuditLog.create({
      data: {
        entityType: PolicyAuditEntityType.USER,
        entityId: id,
        actorId: actor.id,
        beforeJson: before,
        afterJson: updated,
      },
    });

    return updated;
  }

  @Get('admin/users/:id/policy/summary')
  @Roles(UserRole.ADMIN)
  getAdminPolicySummary(@Param('id') id: string) {
    return this.foundationContext.getPolicySummary(id);
  }

  @Post('admin/users/:id/wallet/adjust')
  @Roles(UserRole.ADMIN)
  async adjustWallet(
    @Param('id') id: string,
    @Body() body: { instrumentCode: string; amount: string; reason: string; externalRef?: string },
    @CurrentUser() actor: JwtRequestUser,
  ) {
    const account = await this.accountsService.getOrCreateAccount(id, body.instrumentCode);
    const out = await this.accountsService.applyTransaction({
      accountId: account.id,
      delta: body.amount,
      type: 'ADJUSTMENT' as any,
      refType: 'ADJUSTMENT' as any,
      refId: body.externalRef ?? body.reason,
      createdById: actor.id,
    });

    await this.prisma.policyAuditLog.create({
      data: {
        entityType: PolicyAuditEntityType.ACCOUNT_ADJUSTMENT,
        entityId: out.txRecord.id,
        actorId: actor.id,
        afterJson: { userId: id, instrumentCode: body.instrumentCode, amount: body.amount, reason: body.reason },
      },
    });

    return out;
  }
}
