import { Injectable, NotFoundException } from '@nestjs/common';
import {
  InstrumentType,
  KycLevel,
  PolicyPeriod,
  PolicyRule,
  PolicyScopeType,
  Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { dec, minDec } from '../../common/utils/decimal.util';
import { PrismaService } from '../prisma/prisma.service';

interface RuleMatchParams {
  action: PolicyRule['action'];
  metric: PolicyRule['metric'];
  period: PolicyPeriod;
  instrumentId?: string | null;
  instrumentType?: InstrumentType | null;
}

const KYC_ORDER = [KycLevel.NONE, KycLevel.BASIC, KycLevel.FULL];

function kycIndex(level: KycLevel | null | undefined) {
  return KYC_ORDER.indexOf(level ?? KycLevel.NONE);
}

@Injectable()
export class PolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserContext(userId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { customerGroup: true, userKyc: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getEffectiveRules(userId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const user = await this.getUserContext(userId, db);
    const rules = await db.policyRule.findMany({
      where: {
        enabled: true,
        OR: [
          { scopeType: PolicyScopeType.GLOBAL },
          { scopeType: PolicyScopeType.GROUP, scopeGroupId: user.customerGroupId },
          { scopeType: PolicyScopeType.USER, scopeUserId: user.id },
        ],
      },
    });

    const sortedRules = rules.sort((a, b) => this.compareRules(a, b));

    return { user, userKyc: user.userKyc, customerGroup: user.customerGroup, rules: sortedRules };
  }

  findApplicableRules(params: RuleMatchParams & { rules: PolicyRule[] }) {
    return params.rules
      .filter((rule) => this.matchesRule(rule, params))
      .sort((a, b) => this.compareRules(a, b));
  }

  computeEffectiveLimit(rules: PolicyRule[]): Decimal | null {
    if (!rules.length) {
      return null;
    }

    return rules.reduce((min, rule) => minDec(min, rule.limit), dec(rules[0].limit));
  }

  async getApplicableRulesForRequest(
    params: RuleMatchParams & { userId: string },
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const effective = await this.getEffectiveRules(params.userId, db);
    const applicableRules = this.findApplicableRules({
      rules: effective.rules,
      action: params.action,
      metric: params.metric,
      period: params.period,
      instrumentId: params.instrumentId,
      instrumentType: params.instrumentType,
    });

    const userLevel = effective.userKyc?.level ?? KycLevel.NONE;
    const eligibleRules = applicableRules.filter((rule) => kycIndex(rule.minKycLevel) <= kycIndex(userLevel));
    const kycRequiredLevel = applicableRules.reduce<KycLevel | null>((required, rule) => {
      if (kycIndex(rule.minKycLevel) > kycIndex(userLevel)) {
        if (!required || kycIndex(rule.minKycLevel) > kycIndex(required)) {
          return rule.minKycLevel;
        }
      }
      return required;
    }, null);

    const effectiveLimit = this.computeEffectiveLimit(eligibleRules);

    return {
      kycLevel: userLevel,
      rulesApplied: applicableRules,
      effectiveLimit,
      kycRequiredLevel,
    };
  }

  private matchesRule(
    rule: PolicyRule,
    params: {
      action: PolicyRule['action'];
      metric: PolicyRule['metric'];
      period: PolicyPeriod;
      instrumentId?: string | null;
      instrumentType?: InstrumentType | null;
    },
  ) {
    if (rule.action !== params.action || rule.metric !== params.metric || rule.period !== params.period) {
      return false;
    }

    if (rule.instrumentId) {
      return !!params.instrumentId && rule.instrumentId === params.instrumentId;
    }

    if (rule.instrumentType) {
      if (!params.instrumentType) return false;
      return rule.instrumentType === params.instrumentType;
    }

    return true;
  }

  private compareRules(a: PolicyRule, b: PolicyRule) {
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

    if (a.priority !== b.priority) return a.priority - b.priority;

    return a.createdAt.getTime() - b.createdAt.getTime();
  }

  hasRequiredKyc(userLevel: KycLevel | null | undefined, required: KycLevel) {
    return kycIndex(userLevel) >= kycIndex(required);
  }
}
