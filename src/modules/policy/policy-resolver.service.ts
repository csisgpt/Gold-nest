import { Injectable, NotFoundException } from '@nestjs/common';
import { InstrumentType, PolicyPeriod, PolicyRule, PolicyScopeType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { KycLevel } from '@prisma/client';

interface ApplicableRuleParams {
  rules: PolicyRule[];
  action: PolicyRule['action'];
  metric: PolicyRule['metric'];
  period: PolicyPeriod;
  instrumentId?: string | null;
  instrumentType?: InstrumentType | null;
}

@Injectable()
export class PolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserContext(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customerGroup: true, userKyc: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getEffectiveRules(userId: string) {
    const user = await this.getUserContext(userId);
    const rules = await this.prisma.policyRule.findMany({
      where: {
        enabled: true,
        OR: [
          { scopeType: PolicyScopeType.GLOBAL },
          { scopeType: PolicyScopeType.GROUP, scopeGroupId: user.customerGroupId },
          { scopeType: PolicyScopeType.USER, scopeUserId: user.id },
        ],
      },
      orderBy: [{ priority: 'asc' }],
    });

    const sortedRules = rules.sort((a, b) => this.compareRules(a, b));

    return { user, userKyc: user.userKyc, customerGroup: user.customerGroup, rules: sortedRules };
  }

  findApplicableRules(params: ApplicableRuleParams) {
    return params.rules
      .filter((rule) => this.matchesRule(rule, params))
      .sort((a, b) => this.compareRules(a, b));
  }

  computeEffectiveLimit(rules: PolicyRule[]) {
    if (!rules.length) {
      return new Decimal(Infinity);
    }

    return rules.reduce(
      (min, rule) => Decimal.min(min, new Decimal(rule.limit)),
      new Decimal(Infinity),
    );
  }

  private matchesRule(
    rule: PolicyRule,
    params: { action: PolicyRule['action']; metric: PolicyRule['metric']; period: PolicyPeriod; instrumentId?: string | null; instrumentType?: InstrumentType | null },
  ) {
    if (rule.action !== params.action || rule.metric !== params.metric || rule.period !== params.period) {
      return false;
    }

    if (rule.instrumentId && params.instrumentId && rule.instrumentId !== params.instrumentId) {
      return false;
    }

    if (!rule.instrumentId && params.instrumentId && rule.instrumentType && params.instrumentType && rule.instrumentType !== params.instrumentType) {
      return false;
    }

    if (rule.instrumentId && !params.instrumentId) {
      return false;
    }

    if (rule.instrumentType && params.instrumentType && rule.instrumentType !== params.instrumentType) {
      return false;
    }

    return true;
  }

  private compareRules(a: PolicyRule, b: PolicyRule) {
    if (a.priority !== b.priority) return a.priority - b.priority;

    const scopeRank = (rule: PolicyRule) => {
      switch (rule.scopeType) {
        case PolicyScopeType.USER:
          return 0;
        case PolicyScopeType.GROUP:
          return 1;
        default:
          return 2;
      }
    };

    const selectorRank = (rule: PolicyRule) => {
      if (rule.instrumentId) return 0;
      if (rule.instrumentType) return 1;
      return 2;
    };

    const scopeDiff = scopeRank(a) - scopeRank(b);
    if (scopeDiff !== 0) return scopeDiff;

    const selectorDiff = selectorRank(a) - selectorRank(b);
    if (selectorDiff !== 0) return selectorDiff;

    return a.createdAt.getTime() - b.createdAt.getTime();
  }

  hasRequiredKyc(userLevel: KycLevel | null | undefined, required: KycLevel) {
    const order = [KycLevel.NONE, KycLevel.BASIC, KycLevel.FULL];
    const currentIdx = order.indexOf(userLevel ?? KycLevel.NONE);
    const requiredIdx = order.indexOf(required);
    return currentIdx >= requiredIdx;
  }
}
