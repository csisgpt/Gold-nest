import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AttachmentEntityType, KycLevel, KycStatus, PolicyAuditEntityType, PolicyScopeType, UserRole, UserStatus } from '@prisma/client';
import { ApiErrorCode } from '../../common/http/api-error-codes';
import { PaginationService } from '../../common/pagination/pagination.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AccountsService } from '../accounts/accounts.service';
import { mapWalletAccountDto } from '../accounts/mappers/wallet-account.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { EffectiveSettingsService } from '../user-settings/effective-settings.service';
import { TahesabIntegrationConfigService } from '../tahesab/tahesab-integration.config';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { WalletAdjustDto } from './dto/wallet-adjust.dto';
import { FoundationContextService } from './foundation-context.service';
import { mapUserSafe, userSafeSelect } from './mappers/user-safe.mapper';

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
    private readonly tahesabConfig: TahesabIntegrationConfigService,
  ) {}

  @Get('me/overview')
  async getMeOverview(@CurrentUser() user: JwtRequestUser) {
    const ctx = await this.foundationContext.getUserContext(user.id);
    const wallet = await this.foundationContext.getWalletSummary(user.id);
    const policy = await this.foundationContext.getPolicySummary(user.id);
    const capabilities = await this.foundationContext.getCapabilities(user.id);

    const me = await this.prisma.user.findUnique({ where: { id: user.id }, select: { ...userSafeSelect, customerGroup: true } });
    if (!me) {
      throw new NotFoundException({ code: ApiErrorCode.USER_NOT_FOUND, message: 'User not found' });
    }

    return {
      user: {
        ...mapUserSafe(me),
        customerGroup: me.customerGroup
          ? { id: me.customerGroup.id, code: me.customerGroup.code, name: me.customerGroup.name }
          : null,
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
      throw new BadRequestException({ code: ApiErrorCode.KYC_ALREADY_VERIFIED, message: 'KYC already verified' });
    }

    const fileIds = Array.from(new Set(body.fileIds ?? []));
    if (fileIds.length > 0) {
      const files = await this.prisma.file.findMany({ where: { id: { in: fileIds } }, select: { id: true, uploadedById: true } });
      if (files.length !== fileIds.length) {
        const found = new Set(files.map((f) => f.id));
        const missing = fileIds.filter((id) => !found.has(id));
        throw new BadRequestException({
          code: ApiErrorCode.KYC_INVALID_FILE_IDS,
          message: 'Some files not found',
          details: missing.map((id) => ({ path: 'fileIds', message: `File not found: ${id}` })),
        });
      }

      if (files.some((file) => file.uploadedById !== user.id)) {
        throw new ForbiddenException({ code: ApiErrorCode.KYC_FILES_FORBIDDEN, message: 'You do not own one or more files' });
      }
    }

    const updated = await this.prisma.userKyc.upsert({
      where: { userId: user.id },
      create: { userId: user.id, status: 'PENDING', level: requestedLevel },
      update: { status: 'PENDING', level: requestedLevel },
    });

    if (fileIds.length > 0) {
      await this.prisma.attachment.createMany({
        data: fileIds.map((fileId) => ({
          fileId,
          entityType: AttachmentEntityType.KYC,
          entityId: user.id,
          purpose: body.note,
        })),
        skipDuplicates: true,
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

  @Get('admin/meta/users')
  @Roles(UserRole.ADMIN)
  getAdminUsersMeta() {
    return {
      roles: Object.values(UserRole),
      statuses: Object.values(UserStatus),
      kycStatuses: Object.values(KycStatus),
      kycLevels: Object.values(KycLevel),
      policyScopes: Object.values(PolicyScopeType),
      policySelectors: ['PRODUCT', 'INSTRUMENT', 'TYPE', 'ALL'],
      periods: ['DAILY', 'MONTHLY'],
    };
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
        select: { ...userSafeSelect, customerGroup: true, userKyc: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return this.paginationService.wrap(
      items.map((u) => ({
        ...mapUserSafe(u),
        customerGroup: u.customerGroup ? { id: u.customerGroup.id, code: u.customerGroup.code, name: u.customerGroup.name } : null,
        kyc: u.userKyc,
      })),
      totalItems,
      page,
      limit,
    );
  }

  @Get('admin/users/:id/overview')
  @Roles(UserRole.ADMIN)
  async getAdminUserOverview(@Param('id') id: string, @Query('expand') expand?: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { ...userSafeSelect, customerGroup: true, userKyc: true } });
    if (!user) {
      throw new NotFoundException({ code: ApiErrorCode.USER_NOT_FOUND, message: 'User not found' });
    }

    const [settings, wallet, policy, outbox] = await Promise.all([
      this.effectiveSettings.getEffectiveWithSources(id),
      this.foundationContext.getWalletSummary(id, true),
      this.foundationContext.getPolicySummary(id),
      this.prisma.tahesabOutbox.findFirst({ where: { correlationId: { contains: id } }, orderBy: { createdAt: 'desc' } }),
    ]);

    const includeOutboxHistory = expand?.split(',').includes('outboxHistory');
    const outboxHistory = includeOutboxHistory
      ? await this.prisma.tahesabOutbox.findMany({ where: { correlationId: { contains: id } }, orderBy: { createdAt: 'desc' }, take: 20 })
      : undefined;

    return {
      user: mapUserSafe(user),
      customerGroup: user.customerGroup
        ? {
            id: user.customerGroup.id,
            code: user.customerGroup.code,
            name: user.customerGroup.name,
            tahesabGroupName: user.customerGroup.tahesabGroupName ?? null,
          }
        : null,
      kyc: user.userKyc
        ? {
            status: user.userKyc.status,
            level: user.userKyc.level,
            verifiedAt: user.userKyc.verifiedAt,
            rejectedAt: user.userKyc.rejectedAt,
            rejectReason: user.userKyc.rejectReason,
          }
        : null,
      settings,
      wallet: {
        accounts: wallet.accounts,
        summary: wallet.summary,
      },
      policy: { summary: policy },
      tahesab: {
        enabled: this.tahesabConfig.isEnabled(),
        customerCode: user.tahesabCustomerCode ?? null,
        groupName: user.customerGroup?.tahesabGroupName ?? user.customerGroup?.code ?? null,
        lastOutbox: outbox,
        outboxHistory,
      },
    };
  }

  @Get('admin/users/:id/wallet/accounts')
  @Roles(UserRole.ADMIN)
  async listAdminUserWalletAccounts(@Param('id') id: string, @Query('page') page = 1, @Query('limit') limit = 20) {
    const { skip, take } = this.paginationService.getSkipTake(Number(page), Number(limit));
    const where = { userId: id };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.account.findMany({ where, include: { instrument: true }, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.account.count({ where }),
    ]);

    return this.paginationService.wrap(items.map((account) => mapWalletAccountDto(account, false)), totalItems, Number(page), Number(limit));
  }

  @Patch('admin/users/:id')
  @Roles(UserRole.ADMIN)
  async patchAdminUser(@Param('id') id: string, @Body() dto: AdminUpdateUserDto, @CurrentUser() actor: JwtRequestUser) {
    const before = await this.prisma.user.findUnique({ where: { id }, select: userSafeSelect });
    if (!before) {
      throw new NotFoundException({ code: ApiErrorCode.USER_NOT_FOUND, message: 'User not found' });
    }

    if (before.status === UserStatus.ACTIVE && dto.status === UserStatus.PENDING_APPROVAL) {
      throw new BadRequestException({ code: ApiErrorCode.INVALID_STATUS_TRANSITION, message: 'Invalid status transition' });
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
      select: userSafeSelect,
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

    return mapUserSafe(updated);
  }

  @Get('admin/users/:id/policy/summary')
  @Roles(UserRole.ADMIN)
  getAdminPolicySummary(@Param('id') id: string) {
    return this.foundationContext.getPolicySummary(id);
  }

  @Post('admin/users/:id/wallet/adjust')
  @Roles(UserRole.ADMIN)
  async adjustWallet(@Param('id') id: string, @Body() body: WalletAdjustDto, @CurrentUser() actor: JwtRequestUser) {
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
