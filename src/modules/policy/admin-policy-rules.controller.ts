import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PolicyAction, PolicyAuditEntityType, PolicyMetric, PolicyPeriod, PolicyScopeType, Prisma, UserRole } from '@prisma/client';
import { dec } from '../../common/utils/decimal.util';
import { runInTx } from '../../common/db/tx.util';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationService } from '../../common/pagination/pagination.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { BulkUpsertPolicyRuleDto, CreatePolicyRuleDto, ListPolicyRulesDto, UpdatePolicyRuleDto } from './dto/policy-rule.dto';
import { normalizeSelector } from './policy-selector.util';

@ApiTags('admin-policy-rules')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/policy-rules')
export class AdminPolicyRulesController {
  constructor(private readonly prisma: PrismaService, private readonly paginationService: PaginationService) {}

  @Get()
  async list(@Query() query: ListPolicyRulesDto) {
    const where: Prisma.PolicyRuleWhereInput = {};
    if (query.scopeType) where.scopeType = query.scopeType;
    if (query.customerGroupId) where.scopeGroupId = query.customerGroupId;
    if (query.userId) where.scopeUserId = query.userId;
    if (query.productId) where.productId = query.productId;
    if (query.instrumentId) where.instrumentId = query.instrumentId;
    if (query.instrumentType) where.instrumentType = query.instrumentType as any;
    if (query.action) where.action = query.action;
    if (query.metric) where.metric = query.metric;
    if (query.period) where.period = query.period;

    const { page, limit, skip, take } = this.paginationService.getSkipTake(query.page, query.limit);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.policyRule.findMany({ where, orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }], skip, take }),
      this.prisma.policyRule.count({ where }),
    ]);

    return this.paginationService.wrap(items, total, page, limit);
  }

  @Post()
  async create(@Body() dto: CreatePolicyRuleDto, @CurrentUser() actor: JwtRequestUser) {
    this.validateScope(dto.scopeType, dto.scopeUserId, dto.scopeGroupId);
    const selector = normalizeSelector(dto);
    this.validateSelector(selector.productId, selector.instrumentId, selector.instrumentType);
    this.validateValue(dto.limit);

    const created = await this.prisma.policyRule.create({
      data: {
        scopeType: dto.scopeType,
        scopeUserId: dto.scopeType === PolicyScopeType.USER ? dto.scopeUserId : null,
        scopeGroupId: dto.scopeType === PolicyScopeType.GROUP ? dto.scopeGroupId : null,
        action: dto.action,
        metric: dto.metric,
        period: dto.period,
        limit: dec(dto.limit),
        ...selector,
        minKycLevel: dto.minKycLevel,
        enabled: dto.enabled ?? true,
        priority: dto.priority ?? 100,
        note: dto.note,
      },
    });

    await this.prisma.policyAuditLog.create({ data: { entityType: PolicyAuditEntityType.POLICY_RULE, entityId: created.id, actorId: actor.id, afterJson: created } });
    return created;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePolicyRuleDto, @CurrentUser() actor: JwtRequestUser) {
    const existing = await this.prisma.policyRule.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException('NOT_FOUND');
    }

    const merged = { ...existing, ...dto } as CreatePolicyRuleDto;
    const selector = normalizeSelector(merged);
    this.validateScope(merged.scopeType, merged.scopeUserId, merged.scopeGroupId);
    this.validateSelector(selector.productId, selector.instrumentId, selector.instrumentType);
    if (merged.limit !== undefined) this.validateValue(merged.limit);

    const updated = await this.prisma.policyRule.update({
      where: { id },
      data: {
        scopeType: merged.scopeType,
        scopeUserId: merged.scopeType === PolicyScopeType.USER ? merged.scopeUserId : null,
        scopeGroupId: merged.scopeType === PolicyScopeType.GROUP ? merged.scopeGroupId : null,
        action: merged.action,
        metric: merged.metric,
        period: merged.period,
        limit: merged.limit !== undefined ? dec(merged.limit) : undefined,
        ...selector,
        minKycLevel: merged.minKycLevel ?? undefined,
        enabled: merged.enabled ?? undefined,
        priority: merged.priority ?? undefined,
        note: merged.note,
      },
    });
    await this.prisma.policyAuditLog.create({ data: { entityType: PolicyAuditEntityType.POLICY_RULE, entityId: id, actorId: actor.id, beforeJson: existing, afterJson: updated } });
    return updated;
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() actor: JwtRequestUser) {
    const before = await this.prisma.policyRule.findUnique({ where: { id } });
    await this.prisma.policyRule.deleteMany({ where: { id } });
    await this.prisma.policyAuditLog.create({ data: { entityType: PolicyAuditEntityType.POLICY_RULE, entityId: id, actorId: actor.id, beforeJson: before } });
    return { deleted: true };
  }

  @Post('bulk-upsert')
  async bulkUpsert(@Body() dto: BulkUpsertPolicyRuleDto) {
    let created = 0;
    let updated = 0;

    await runInTx(this.prisma, async (tx) => {
      for (const item of dto.items) {
        const selector = normalizeSelector(item);
        this.validateScope(item.scopeType, item.scopeUserId, item.scopeGroupId);
        this.validateSelector(selector.productId, selector.instrumentId, selector.instrumentType);
        this.validateValue(item.limit);

        const where: Prisma.PolicyRuleWhereInput = {
          scopeType: item.scopeType,
          scopeUserId: item.scopeType === PolicyScopeType.USER ? item.scopeUserId : null,
          scopeGroupId: item.scopeType === PolicyScopeType.GROUP ? item.scopeGroupId : null,
          action: item.action,
          metric: item.metric,
          period: item.period,
        };

        if (selector.productId) where.productId = selector.productId;
        else if (selector.instrumentId) where.instrumentId = selector.instrumentId;
        else if (selector.instrumentType) where.instrumentType = selector.instrumentType;
        else {
          where.productId = null;
          where.instrumentId = null;
          where.instrumentType = null;
        }

        const existing = await tx.policyRule.findFirst({ where });

        if (existing) {
          await tx.policyRule.update({
            where: { id: existing.id },
            data: {
              limit: dec(item.limit),
              minKycLevel: item.minKycLevel ?? undefined,
              enabled: item.enabled ?? true,
              priority: item.priority ?? 100,
              note: item.note,
              ...selector,
            },
          });
          updated += 1;
        } else {
          await tx.policyRule.create({
            data: {
              scopeType: item.scopeType,
              scopeUserId: item.scopeType === PolicyScopeType.USER ? item.scopeUserId : null,
              scopeGroupId: item.scopeType === PolicyScopeType.GROUP ? item.scopeGroupId : null,
              action: item.action,
              metric: item.metric,
              period: item.period,
              limit: dec(item.limit),
              ...selector,
              note: item.note,
            },
          });
          created += 1;
        }
      }
    });

    return { created, updated };
  }

  private validateScope(scopeType: PolicyScopeType, userId?: string | null, groupId?: string | null) {
    if (scopeType === PolicyScopeType.USER && !userId) {
      throw new BadRequestException('INVALID_SCOPE_FIELDS');
    }
    if (scopeType === PolicyScopeType.GROUP && !groupId) {
      throw new BadRequestException('INVALID_SCOPE_FIELDS');
    }
    if (scopeType === PolicyScopeType.GLOBAL && (userId || groupId)) {
      throw new BadRequestException('INVALID_SCOPE_FIELDS');
    }
  }

  private validateSelector(productId?: string | null, instrumentId?: string | null, instrumentType?: any) {
    const setCount = [productId, instrumentId, instrumentType].filter((v) => v).length;
    if (setCount > 1) {
      throw new BadRequestException('INVALID_SELECTOR_COMBINATION');
    }
  }

  private validateValue(limit?: string | null) {
    if (limit === undefined || limit === null) return;
    if (Number(limit) <= 0 || Number.isNaN(Number(limit))) {
      throw new BadRequestException('INVALID_VALUE');
    }
  }
}
