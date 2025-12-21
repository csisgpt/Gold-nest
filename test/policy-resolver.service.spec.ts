import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Decimal } from '@prisma/client/runtime/library';
import { PolicyResolverService } from '../src/modules/policy/policy-resolver.service';

enum InstrumentType {
  GOLD = 'GOLD',
  FIAT = 'FIAT',
  COIN = 'COIN',
  OTHER = 'OTHER',
}

enum KycLevel {
  NONE = 'NONE',
  BASIC = 'BASIC',
  FULL = 'FULL',
}

enum PolicyAction {
  TRADE_BUY = 'TRADE_BUY',
}

enum PolicyMetric {
  COUNT = 'COUNT',
}

enum PolicyPeriod {
  DAILY = 'DAILY',
}

enum PolicyScopeType {
  GLOBAL = 'GLOBAL',
  GROUP = 'GROUP',
  USER = 'USER',
}

type PolicyRule = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  scopeType: PolicyScopeType;
  scopeUserId: string | null;
  scopeGroupId: string | null;
  action: PolicyAction;
  metric: PolicyMetric;
  period: PolicyPeriod;
  limit: Decimal;
  minKycLevel: KycLevel;
  instrumentId: string | null;
  instrumentType: InstrumentType | null;
  enabled: boolean;
  priority: number;
  note: string | null;
};

const baseRule: PolicyRule = {
  id: 'r',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  scopeType: PolicyScopeType.GLOBAL,
  scopeUserId: null,
  scopeGroupId: null,
  action: PolicyAction.TRADE_BUY,
  metric: PolicyMetric.COUNT,
  period: PolicyPeriod.DAILY,
  limit: new Decimal(100),
  minKycLevel: KycLevel.NONE,
  instrumentId: null,
  instrumentType: null,
  enabled: true,
  priority: 100,
  note: null,
};

function rule(overrides: Partial<PolicyRule>): PolicyRule {
  return { ...baseRule, id: Math.random().toString(), ...overrides } as PolicyRule;
}

const resolver = new PolicyResolverService({} as any);

test('rule with instrumentType requires matching instrumentType parameter', () => {
  const goldRule = rule({ instrumentType: InstrumentType.GOLD });
  const applicable = resolver.findApplicableRules({
    rules: [goldRule],
    action: goldRule.action,
    metric: goldRule.metric,
    period: goldRule.period,
    instrumentId: null,
    instrumentType: null,
  });
  assert.strictEqual(applicable.length, 0);
});

test('rule with instrumentId matches only identical id', () => {
  const targetRule = rule({ instrumentId: 'inst-1', instrumentType: null });
  const matched = resolver.findApplicableRules({
    rules: [targetRule],
    action: targetRule.action,
    metric: targetRule.metric,
    period: targetRule.period,
    instrumentId: 'inst-1',
    instrumentType: InstrumentType.GOLD,
  });
  assert.strictEqual(matched.length, 1);

  const unmatched = resolver.findApplicableRules({
    rules: [targetRule],
    action: targetRule.action,
    metric: targetRule.metric,
    period: targetRule.period,
    instrumentId: 'inst-2',
    instrumentType: InstrumentType.GOLD,
  });
  assert.strictEqual(unmatched.length, 0);
});

test('precedence orders by scope, selector specificity, then priority', () => {
  const globalRule = rule({ id: 'g', priority: 50 });
  const groupRule = rule({ id: 'grp', scopeType: PolicyScopeType.GROUP, priority: 80 });
  const userRule = rule({ id: 'u', scopeType: PolicyScopeType.USER, priority: 90 });
  const instrumentSpecific = rule({ id: 'instr', instrumentId: 'x', priority: 120 });
  const instrumentTypeRule = rule({ id: 'type', instrumentType: InstrumentType.GOLD, priority: 30 });
  const sameScopePriorityA = rule({ id: 'p1', priority: 1 });
  const sameScopePriorityB = rule({ id: 'p2', priority: 5 });

  const ordered = resolver.findApplicableRules({
    rules: [globalRule, groupRule, userRule, instrumentSpecific, instrumentTypeRule, sameScopePriorityB, sameScopePriorityA],
    action: baseRule.action,
    metric: baseRule.metric,
    period: baseRule.period,
    instrumentId: 'x',
    instrumentType: InstrumentType.GOLD,
  });

  const ids = ordered.map((r) => r.id);
  assert.deepStrictEqual(ids.slice(0, 3), ['u', 'grp', 'instr']);
  assert.ok(ids.indexOf('instr') < ids.indexOf('type'));
  assert.ok(ids.indexOf('type') < ids.indexOf('g'));
  assert.ok(ids.indexOf('p1') < ids.indexOf('p2'));
});
