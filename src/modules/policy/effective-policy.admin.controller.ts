import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KycLevel, PolicyRule, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PolicyResolverService } from './policy-resolver.service';

@ApiTags('admin-effective-policy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller()
export class EffectivePolicyAdminController {
  constructor(private readonly policyResolver: PolicyResolverService) {}

  @Get('admin/users/:id/effective-policy')
  async get(@Param('id') id: string) {
    const effective = await this.policyResolver.getEffectiveRules(id);
    const groupsMap = new Map<string, { action: string; metric: string; period: string; rules: PolicyRule[] }>();

    for (const rule of effective.rules) {
      const key = `${rule.action}:${rule.metric}:${rule.period}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { action: rule.action, metric: rule.metric, period: rule.period, rules: [] });
      }
      groupsMap.get(key)!.rules.push(rule);
    }

    const order = [KycLevel.NONE, KycLevel.BASIC, KycLevel.FULL];
    const userLevel = effective.userKyc?.level ?? KycLevel.NONE;

    const grouped = Array.from(groupsMap.values()).map((group) => {
      const applicable = this.policyResolver.findApplicableRules({
        rules: group.rules,
        action: group.action as any,
        metric: group.metric as any,
        period: group.period as any,
        instrumentId: undefined,
        instrumentType: undefined,
      });

      const kycRequiredLevel = applicable.reduce<KycLevel | null>((required, rule) => {
        const ruleIdx = order.indexOf(rule.minKycLevel);
        const currentIdx = order.indexOf(required ?? KycLevel.NONE);
        const userIdx = order.indexOf(userLevel);
        if (ruleIdx > userIdx && ruleIdx > currentIdx) {
          return rule.minKycLevel;
        }
        return required;
      }, null);

      const eligible = applicable.filter((rule) => order.indexOf(rule.minKycLevel) <= order.indexOf(userLevel));

      return {
        action: group.action,
        metric: group.metric,
        period: group.period,
        rules: applicable,
        effectiveLimit: this.policyResolver.computeEffectiveLimit(eligible),
        kycRequiredLevel,
      };
    });

    return {
      user: { id: effective.user.id, fullName: effective.user.fullName, mobile: effective.user.mobile },
      customerGroup: effective.customerGroup,
      kyc: effective.userKyc,
      ruleGroups: grouped,
    };
  }
}
