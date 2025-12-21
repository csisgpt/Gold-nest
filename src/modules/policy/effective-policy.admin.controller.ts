import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PolicyRule, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyContextBuilder } from './policy-context-builder.service';
import { PolicyResolutionService } from './policy-resolution.service';

@ApiTags('admin-effective-policy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller()
export class EffectivePolicyAdminController {
  constructor(
    private readonly policyResolver: PolicyResolutionService,
    private readonly prisma: PrismaService,
    private readonly contextBuilder: PolicyContextBuilder,
  ) {}

  @Get('admin/users/:id/effective-policy')
  async get(@Param('id') id: string, @Query() query: any) {
    if ([query.productId, query.instrumentId, query.instrumentType].filter(Boolean).length > 1) {
      throw new BadRequestException('INVALID_SELECTOR_COMBINATION');
    }

    const baseContext = await this.policyResolver.getUserContext(id);
    let context = { ...baseContext } as any;

    if (query.productId) {
      const built = await this.contextBuilder.buildFromMarketProduct(query.productId);
      context = { ...context, productId: built.productId, instrumentId: built.instrumentId, instrumentType: built.instrumentType };
    }

    if (query.instrumentId) {
      context.instrumentId = query.instrumentId;
      const instrument = await this.prisma.instrument.findUnique({ where: { id: query.instrumentId } });
      context.instrumentType = instrument?.type;
    }

    if (query.instrumentType) {
      context.instrumentType = query.instrumentType;
    }

    const rules = await this.policyResolver.loadRulesForContext(context, this.prisma);

    const groupsMap = new Map<string, { action: string; metric: string; period: string; rules: PolicyRule[] }>();
    for (const rule of rules) {
      const key = `${rule.action}:${rule.metric}:${rule.period}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { action: rule.action, metric: rule.metric, period: rule.period, rules: [] });
      }
      groupsMap.get(key)!.rules.push(rule);
    }

    const grouped = Array.from(groupsMap.values()).map((group) => {
      const trace = this.policyResolver.resolveFromRules({
        action: group.action as any,
        metric: group.metric as any,
        period: group.period as any,
        context,
        rules,
      });

      return {
        action: group.action,
        metric: group.metric,
        period: group.period,
        selected: trace.selected,
        candidates: trace.candidates,
        kycRequiredLevel: trace.kycRequiredLevel,
      };
    });

    return {
      context,
      ruleGroups: grouped,
    };
  }
}
