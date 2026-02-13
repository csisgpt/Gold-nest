import { Injectable, NotFoundException } from '@nestjs/common';
import {
  InstrumentType,
  KycLevel,
  PolicyAction,
  PolicyMetric,
  PolicyPeriod,
  PolicyRule,
  PolicyScopeType,
  Prisma,
  TradeType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { dec } from '../../common/utils/decimal.util';
import { PrismaService } from '../prisma/prisma.service';

export type PolicySelectorSource = 'PRODUCT' | 'INSTRUMENT' | 'TYPE' | 'ALL';

export interface PolicyContext {
  userId: string;
  customerGroupId?: string | null;
  productId?: string | null;
  instrumentId?: string | null;
  instrumentType?: InstrumentType | null;
  tradeType?: TradeType | null;
  kycLevel?: KycLevel | null;
}

export interface ResolveRequest {
  action: PolicyAction;
  metric: PolicyMetric;
  period: PolicyPeriod;
  context: PolicyContext;
  rules?: PolicyRule[];
}

export interface PolicyResolutionTrace {
  selected: {
    rule: PolicyRule;
    value: Decimal;
    source: PolicyScopeType;
    selectorUsed: PolicySelectorSource;
  } | null;
  candidates: Array<{
    rule: PolicyRule;
    matches: boolean;
    selectorUsed: PolicySelectorSource;
    selectorRank: number;
    scopeRank: number;
    eligibleByKyc: boolean;
  }>;
  context: PolicyContext;
  kycRequiredLevel: KycLevel | null;
}

const KycLevelEnum = (KycLevel as any) ?? { NONE: 'NONE', BASIC: 'BASIC', FULL: 'FULL' };
const KYC_ORDER = [KycLevelEnum.NONE, KycLevelEnum.BASIC, KycLevelEnum.FULL];

@Injectable()
export class PolicyResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserContext(userId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { customerGroup: true, userKyc: true },
    });

    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    return {
      userId: user.id,
      customerGroupId: user.customerGroupId,
      kycLevel: user.userKyc?.status === 'VERIFIED' ? user.userKyc.level : KycLevel.NONE,
    } satisfies PolicyContext;
  }

  async resolveWithTrace(
    params: ResolveRequest,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<PolicyResolutionTrace> {
    const hydratedContext = await this.hydrateContext(params.context, db);
    const rules = params.rules ?? (await this.loadRulesForContext(hydratedContext, db));

    return this.resolveFromRules({ ...params, context: hydratedContext, rules });
  }

  async resolve(
    params: ResolveRequest,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{
    value: Decimal | null;
    source: PolicyScopeType | 'NONE';
    ruleId: string | null;
    selectorUsed: PolicySelectorSource | null;
    ruleUpdatedAt?: Date;
    kycRequiredLevel: KycLevel | null;
  }>
  {
    const trace = await this.resolveWithTrace(params, db);
    if (!trace.selected) {
      return {
        value: null,
        source: 'NONE',
        ruleId: null,
        selectorUsed: null,
        kycRequiredLevel: trace.kycRequiredLevel,
      };
    }

    return {
      value: trace.selected.value,
      source: trace.selected.source,
      ruleId: trace.selected.rule.id,
      selectorUsed: trace.selected.selectorUsed,
      ruleUpdatedAt: trace.selected.rule.updatedAt,
      kycRequiredLevel: trace.kycRequiredLevel,
    };
  }

  resolveFromRules(params: Required<ResolveRequest>): PolicyResolutionTrace {
    const { rules, action, metric, period, context } = params;
    const eligibleRules = rules.filter((rule) => this.matchesScope(rule, context) && rule.enabled);

    const candidates = eligibleRules
      .filter((rule) => rule.action === action && rule.metric === metric && rule.period === period)
      .map((rule) => {
        const matches = this.matchesSelector(rule, context);
        const selectorUsed = this.selectorUsed(rule);
        const selectorRank = this.selectorRank(rule);
        const scopeRank = this.scopeRank(rule.scopeType);
        const eligibleByKyc = this.hasRequiredKyc(context.kycLevel, rule.minKycLevel);
        return { rule, matches, selectorUsed, selectorRank, scopeRank, eligibleByKyc };
      });

    const matching = candidates.filter((c) => c.matches && c.eligibleByKyc);
    const blocked = candidates.filter((c) => c.matches && !c.eligibleByKyc);
    const selected = matching.sort((a, b) => this.compareRules(a.rule, b.rule))[0];

    const kycRequiredLevel = blocked.reduce<KycLevel | null>((current, cand) => {
      if (!current) return cand.rule.minKycLevel;
      return this.kycIndex(cand.rule.minKycLevel) < this.kycIndex(current) ? cand.rule.minKycLevel : current;
    }, null);

    return {
      selected: selected
        ? {
            rule: selected.rule,
            value: dec(selected.rule.limit),
            source: selected.rule.scopeType,
            selectorUsed: selected.selectorUsed,
          }
        : null,
      candidates,
      context,
      kycRequiredLevel,
    };
  }

  async loadRulesForContext(
    context: PolicyContext,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return db.policyRule.findMany({
      where: {
        enabled: true,
        OR: [
          { scopeType: PolicyScopeType.USER, scopeUserId: context.userId },
          ...(context.customerGroupId
            ? [{ scopeType: PolicyScopeType.GROUP, scopeGroupId: context.customerGroupId }]
            : []),
          { scopeType: PolicyScopeType.GLOBAL },
        ],
      },
    });
  }

  selectorUsed(rule: PolicyRule): PolicySelectorSource {
    if (rule.productId) return 'PRODUCT';
    if (rule.instrumentId) return 'INSTRUMENT';
    if (rule.instrumentType) return 'TYPE';
    return 'ALL';
  }

  private selectorRank(rule: PolicyRule) {
    if (rule.productId) return 0;
    if (rule.instrumentId) return 1;
    if (rule.instrumentType) return 2;
    return 3;
  }

  private scopeRank(scope: PolicyScopeType) {
    switch (scope) {
      case PolicyScopeType.USER:
        return 0;
      case PolicyScopeType.GROUP:
        return 1;
      default:
        return 2;
    }
  }

  private matchesScope(rule: PolicyRule, context: PolicyContext) {
    if (rule.scopeType === PolicyScopeType.USER) return rule.scopeUserId === context.userId;
    if (rule.scopeType === PolicyScopeType.GROUP) return rule.scopeGroupId === context.customerGroupId;
    return true;
  }

  private matchesSelector(rule: PolicyRule, context: PolicyContext) {
    if (rule.productId) {
      return !!context.productId && context.productId === rule.productId;
    }

    if (rule.instrumentId) {
      return !!context.instrumentId && rule.instrumentId === context.instrumentId;
    }

    if (rule.instrumentType) {
      return !!context.instrumentType && rule.instrumentType === context.instrumentType;
    }

    return true;
  }

  private compareRules(a: PolicyRule, b: PolicyRule) {
    const scopeDiff = this.scopeRank(a.scopeType) - this.scopeRank(b.scopeType);
    if (scopeDiff !== 0) return scopeDiff;

    const selectorDiff = this.selectorRank(a) - this.selectorRank(b);
    if (selectorDiff !== 0) return selectorDiff;

    const priorityDiff = (a.priority ?? 100) - (b.priority ?? 100);
    if (priorityDiff !== 0) return priorityDiff;

    const updatedDiff = (b.updatedAt?.getTime?.() ?? 0) - (a.updatedAt?.getTime?.() ?? 0);
    if (updatedDiff !== 0) return updatedDiff;

    return (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0);
  }

  private kycIndex(level: KycLevel | null | undefined) {
    return KYC_ORDER.indexOf((level as any) ?? KycLevelEnum.NONE);
  }

  private hasRequiredKyc(userLevel: KycLevel | null | undefined, required: KycLevel | null | undefined) {
    if (!required) return true;
    return this.kycIndex(userLevel) >= this.kycIndex(required);
  }

  private async hydrateContext(
    context: PolicyContext,
    db: Prisma.TransactionClient | PrismaService,
  ): Promise<PolicyContext> {
    if (context.customerGroupId !== undefined && context.kycLevel !== undefined) {
      return context;
    }

    const userContext = await this.getUserContext(context.userId, db);

    return {
      ...context,
      customerGroupId: context.customerGroupId ?? userContext.customerGroupId,
      kycLevel: context.kycLevel ?? userContext.kycLevel,
    };
  }
}
