import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PolicyAction, PolicyMetric, PolicyPeriod, PolicyScopeType, UserRole } from '@prisma/client';
import { dec } from '../../common/utils/decimal.util';
import { runInTx } from '../../common/db/tx.util';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyResolutionService } from './policy-resolution.service';
import {
  ApplyProductLimitsDto,
  LimitCellChangeDto,
  ProductLimitCell,
  ProductLimitRow,
  ProductLimitsQueryDto,
} from './dto/user-product-limits.dto';
import { PolicyContext } from './policy-resolution.service';

@ApiTags('admin-product-limits')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class UserProductLimitsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolution: PolicyResolutionService,
  ) {}

  @Get('users/:userId/product-limits')
  async getGrid(@Param('userId') userId: string, @Query() query: ProductLimitsQueryDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customerGroup: true, userKyc: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const includeInactive =
      query.includeInactiveProducts === true || (query.includeInactiveProducts as any) === 'true';

    const products = await this.prisma.marketProduct.findMany({
      where: {
        groupKey: query.groupKey ?? undefined,
        isActive: includeInactive ? undefined : true,
      },
      include: { baseInstrument: true },
      orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }],
    });

    const rules = await this.resolution.loadRulesForContext({ userId, customerGroupId: user.customerGroupId }, this.prisma);

    const contextBase: PolicyContext = {
      userId,
      customerGroupId: user.customerGroupId,
      kycLevel: user.userKyc?.level ?? null,
    };

    const rows: ProductLimitRow[] = [];

    for (const product of products) {
      const context: PolicyContext = {
        ...contextBase,
        productId: product.id,
        instrumentId: product.baseInstrumentId,
        instrumentType: product.baseInstrument.type,
        tradeType: product.tradeType,
      };

      const metric = product.unitType as PolicyMetric;

      const buildCell = async (action: PolicyAction, period: PolicyPeriod): Promise<ProductLimitCell> => {
        const trace = this.resolution.resolveFromRules({ action, metric, period, context, rules });
        return {
          effectiveValue: trace.selected ? Number(dec(trace.selected.value)) : null,
          source: trace.selected?.source ?? 'NONE',
          selectedRuleId: trace.selected?.rule.id ?? null,
          selectorUsed: trace.selected?.selectorUsed ?? null,
          updatedAt: trace.selected?.rule.updatedAt,
        };
      };

      rows.push({
        productId: product.id,
        code: product.code,
        displayName: product.displayName,
        groupKey: product.groupKey,
        sortOrder: product.sortOrder,
        isActive: product.isActive,
        unitType: metric,
        tradeType: product.tradeType,
        productType: product.productType,
        limits: {
          buyDaily: await buildCell(PolicyAction.TRADE_BUY, PolicyPeriod.DAILY),
          buyMonthly: await buildCell(PolicyAction.TRADE_BUY, PolicyPeriod.MONTHLY),
          sellDaily: await buildCell(PolicyAction.TRADE_SELL, PolicyPeriod.DAILY),
          sellMonthly: await buildCell(PolicyAction.TRADE_SELL, PolicyPeriod.MONTHLY),
        },
      });
    }

    const grouped = rows.reduce<Record<string, ProductLimitRow[]>>((acc, row) => {
      acc[row.groupKey] = acc[row.groupKey] ?? [];
      acc[row.groupKey].push(row);
      return acc;
    }, {});

    return {
      user: { id: user.id, customerGroupId: user.customerGroupId, kycLevel: user.userKyc?.level ?? null },
      groups: Object.entries(grouped).map(([groupKey, items]) => ({ groupKey, items })),
    };
  }

  @Post('users/:userId/product-limits:apply')
  async apply(@Param('userId') userId: string, @Body() dto: ApplyProductLimitsDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const productIds = dto.changes.map((c) => c.productId);
    const products = await this.prisma.marketProduct.findMany({
      where: { id: { in: productIds } },
      include: { baseInstrument: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const change of dto.changes) {
      if (!productMap.has(change.productId)) {
        throw new BadRequestException('MARKET_PRODUCT_NOT_FOUND');
      }
    }

    let created = 0;
    let updated = 0;
    let deleted = 0;

    await runInTx(this.prisma, async (tx) => {
      for (const change of dto.changes) {
        const product = productMap.get(change.productId)!;
        const metric = product.unitType as PolicyMetric;
        const instrumentId = product.baseInstrumentId;
        const instrumentType = product.baseInstrument.type;

        const applyCell = async (cell: LimitCellChangeDto | undefined, action: PolicyAction, period: PolicyPeriod) => {
          if (!cell) return;
          if (cell.mode === 'SET') {
            if (!cell.value || cell.value <= 0) throw new BadRequestException('INVALID_VALUE');
            const existing = await tx.policyRule.findFirst({
              where: {
                scopeType: PolicyScopeType.USER,
                scopeUserId: userId,
                productId: product.id,
                action,
                metric,
                period,
              },
            });

            if (existing) {
              await tx.policyRule.update({ where: { id: existing.id }, data: { limit: dec(cell.value) } });
              updated += 1;
            } else {
              await tx.policyRule.create({
                data: {
                  scopeType: PolicyScopeType.USER,
                  scopeUserId: userId,
                  productId: product.id,
                  action,
                  metric,
                  period,
                  limit: dec(cell.value),
                  instrumentId,
                  instrumentType,
                },
              });
              created += 1;
            }
          } else if (cell.mode === 'CLEAR') {
            const res = await tx.policyRule.deleteMany({
              where: {
                scopeType: PolicyScopeType.USER,
                scopeUserId: userId,
                productId: product.id,
                action,
                metric,
                period,
              },
            });
            deleted += res.count;
          }
        };

        await applyCell(change.buyDaily, PolicyAction.TRADE_BUY, PolicyPeriod.DAILY);
        await applyCell(change.buyMonthly, PolicyAction.TRADE_BUY, PolicyPeriod.MONTHLY);
        await applyCell(change.sellDaily, PolicyAction.TRADE_SELL, PolicyPeriod.DAILY);
        await applyCell(change.sellMonthly, PolicyAction.TRADE_SELL, PolicyPeriod.MONTHLY);
      }
    });

    return { created, updated, deleted };
  }
}
