import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Decimal } from '@prisma/client/runtime/library';
import { PolicyViolationException } from '../src/common/exceptions/policy-violation.exception';
import { LimitsService } from '../src/modules/policy/limits.service';
import { PeriodKeyService } from '../src/modules/policy/period-key.service';

enum LimitReservationStatus {
  RESERVED = 'RESERVED',
  CONSUMED = 'CONSUMED',
  RELEASED = 'RELEASED',
}

enum PolicyAction {
  TRADE_BUY = 'TRADE_BUY',
}

enum PolicyMetric {
  COUNT = 'COUNT',
}

enum PolicyPeriod {
  DAILY = 'DAILY',
  MONTHLY = 'MONTHLY',
}

enum InstrumentType {
  COIN = 'COIN',
  GOLD = 'GOLD',
}

class StubPolicyResolver {
  constructor(private readonly behavior: any = { limit: new Decimal(100) }) {}

  async getApplicableRulesForRequest(params: any) {
    if (typeof this.behavior === 'function') {
      return this.behavior(params);
    }

    const effectiveLimit = this.behavior.limit ?? null;
    const kycRequiredLevel = this.behavior.kycRequiredLevel ?? null;
    const eligibleRules = this.behavior.eligibleRules ?? [];
    const blockedByKycRules = this.behavior.blockedByKycRules ?? [];

    return {
      effectiveLimit,
      kycRequiredLevel,
      eligibleRules,
      blockedByKycRules,
      rulesApplied: eligibleRules,
      kycLevel: null,
    };
  }
}

type Usage = {
  id: string;
  userId: string;
  action: PolicyAction;
  metric: PolicyMetric;
  period: PolicyPeriod;
  periodKey: string;
  instrumentKey: string;
  usedAmount: Decimal;
  reservedAmount: Decimal;
};

type Reservation = {
  id: string;
  usageId: string;
  userId: string;
  amount: Decimal;
  refType: string;
  refId: string;
  status: LimitReservationStatus;
};

class InMemoryPrisma {
  private usageData: Usage[];
  private reservationData: Reservation[];
  private instrumentData: any[];
  limitUsage: any;
  limitReservation: any;
  instrument: any;

  constructor() {
    this.usageData = [];
    this.reservationData = [];
    this.instrumentData = [];
    this.limitUsage = {
      data: this.usageData,
      upsert: async (params: any): Promise<Usage> => {
        const existing = this.usageData.find(
          (u) =>
            u.userId === params.where.userId_action_metric_period_periodKey_instrumentKey.userId &&
            u.action === params.where.userId_action_metric_period_periodKey_instrumentKey.action &&
            u.metric === params.where.userId_action_metric_period_periodKey_instrumentKey.metric &&
            u.period === params.where.userId_action_metric_period_periodKey_instrumentKey.period &&
            u.periodKey === params.where.userId_action_metric_period_periodKey_instrumentKey.periodKey &&
            u.instrumentKey === params.where.userId_action_metric_period_periodKey_instrumentKey.instrumentKey,
        );
        if (existing) return existing;
        const created: Usage = {
          id: this.nextId('usage'),
          usedAmount: new Decimal(0),
          reservedAmount: new Decimal(0),
          ...params.create,
        };
        this.usageData.push(created);
        return created;
      },
      findUnique: async (params: any) => {
        return this.usageData.find((u) => u.id === params.where.id) ?? null;
      },
      update: async (params: any) => {
        const found = this.usageData.find((u) => u.id === params.where.id);
        if (!found) throw new Error('not found');
        Object.assign(found, params.data);
        return found;
      },
    };

    this.limitReservation = {
      data: this.reservationData,
      findUnique: async (params: any) => {
        return (
          this.reservationData.find(
            (r) =>
              r.usageId === params.where.refType_refId_usageId.usageId &&
              r.refId === params.where.refType_refId_usageId.refId &&
              r.refType === params.where.refType_refId_usageId.refType,
          ) || null
        );
      },
      create: async (params: any) => {
        const created: Reservation = { id: this.nextId('res'), ...params.data };
        this.reservationData.push(created);
        return created;
      },
      findMany: async (params: any) => {
        return this.reservationData.filter(
          (r) => r.refId === params.where.refId && r.refType === params.where.refType,
        );
      },
      update: async (params: any) => {
        const found = this.reservationData.find((r) => r.id === params.where.id);
        if (!found) throw new Error('not found');
        Object.assign(found, params.data);
        return found;
      },
    };

    this.instrument = {
      data: this.instrumentData,
      findUnique: async (params: any) =>
        this.instrumentData.find((i) => i.id === params.where.id) ?? null,
    };
  }

  async $executeRawUnsafe() {
    return 1;
  }

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this as any);
  }

  private nextId(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

class StubPeriodKeyService extends PeriodKeyService {
  getDailyKey(): string {
    return 'day-key';
  }
  getMonthlyKey(): string {
    return 'month-key';
  }
}

function createService(limit: Decimal | null = new Decimal(100)) {
  const prisma = new InMemoryPrisma() as any;
  return {
    service: new LimitsService(prisma, new StubPeriodKeyService(), new StubPolicyResolver({ limit }) as any),
    prisma,
  };
}

function createServiceWithResolverBehavior(behavior: any) {
  const prisma = new InMemoryPrisma() as any;
  return {
    service: new LimitsService(prisma, new StubPeriodKeyService(), new StubPolicyResolver(behavior) as any),
    prisma,
  };
}

test('reserve defaults instrumentKey to ALL', async () => {
  const { service } = createService();
  const result = await service.reserve({
    userId: 'u1',
    action: PolicyAction.TRADE_BUY,
    metric: PolicyMetric.COUNT,
    period: PolicyPeriod.DAILY,
    amount: new Decimal(10),
    refId: 'r1',
    refType: 'TEST',
  });

  assert.strictEqual(result.usage.instrumentKey, 'ALL');
  assert.strictEqual(result.reservation.status, LimitReservationStatus.RESERVED);
});

test('reserve is idempotent for same reference', async () => {
  const { service } = createService();
  await service.reserve({
    userId: 'u1',
    action: PolicyAction.TRADE_BUY,
    metric: PolicyMetric.COUNT,
    period: PolicyPeriod.DAILY,
    amount: new Decimal(10),
    refId: 'ref',
    refType: 'TEST',
  });
  const second = await service.reserve({
    userId: 'u1',
    action: PolicyAction.TRADE_BUY,
    metric: PolicyMetric.COUNT,
    period: PolicyPeriod.DAILY,
    amount: new Decimal(10),
    refId: 'ref',
    refType: 'TEST',
  });

  assert.strictEqual(second.usage.reservedAmount.toString(), '10');
});

test('consume is idempotent', async () => {
  const { service, prisma } = createService();
  await service.reserve({
    userId: 'u1',
    action: PolicyAction.TRADE_BUY,
    metric: PolicyMetric.COUNT,
    period: PolicyPeriod.DAILY,
    amount: new Decimal(10),
    refId: 'ref',
    refType: 'TEST',
  });

  await service.consume({ refId: 'ref', refType: 'TEST' });
  await service.consume({ refId: 'ref', refType: 'TEST' });

  const usage = prisma.limitUsage.data[0];
  assert.strictEqual(usage.usedAmount.toString(), '10');
  assert.strictEqual(usage.reservedAmount.toString(), '0');
});

test('release is idempotent', async () => {
  const { service, prisma } = createService();
  await service.reserve({
    userId: 'u1',
    action: PolicyAction.TRADE_BUY,
    metric: PolicyMetric.COUNT,
    period: PolicyPeriod.DAILY,
    amount: new Decimal(10),
    refId: 'ref',
    refType: 'TEST',
  });

  await service.release({ refId: 'ref', refType: 'TEST' });
  await service.release({ refId: 'ref', refType: 'TEST' });

  const usage = prisma.limitUsage.data[0];
  assert.strictEqual(usage.reservedAmount.toString(), '0');
});

test('reserve fails when projected exceeds limit', async () => {
  const { service } = createService(new Decimal(5));
  await assert.rejects(
    () =>
      service.reserve({
        userId: 'u1',
        action: PolicyAction.TRADE_BUY,
        metric: PolicyMetric.COUNT,
        period: PolicyPeriod.DAILY,
        amount: new Decimal(10),
        refId: 'ref',
        refType: 'TEST',
      }),
    PolicyViolationException,
  );
});

test('reserve uses eligible rules even when higher KYC rules exist', async () => {
  const { service } = createServiceWithResolverBehavior({
    limit: new Decimal(50),
    kycRequiredLevel: 'BASIC',
    eligibleRules: [{}],
  });

  const result = await service.reserve({
    userId: 'u1',
    action: PolicyAction.TRADE_BUY,
    metric: PolicyMetric.COUNT,
    period: PolicyPeriod.DAILY,
    amount: new Decimal(10),
    refId: 'kyc-ok',
    refType: 'TEST',
  });

  assert.strictEqual(result.usage.reservedAmount.toString(), '10');
});

test('reserve throws KYC_REQUIRED when only blocked rules exist', async () => {
  const { service } = createServiceWithResolverBehavior({
    limit: null,
    kycRequiredLevel: 'BASIC',
    eligibleRules: [],
    blockedByKycRules: [{}],
  });

  await assert.rejects(
    () =>
      service.reserve({
        userId: 'u1',
        action: PolicyAction.TRADE_BUY,
        metric: PolicyMetric.COUNT,
        period: PolicyPeriod.DAILY,
        amount: new Decimal(10),
        refId: 'kyc-block',
        refType: 'TEST',
      }),
    PolicyViolationException,
  );
});

test('reserve applies instrumentType rules when provided via instrument lookup', async () => {
  const behavior = (params: any) => {
    if (params.instrumentType === InstrumentType.COIN) {
      return {
        effectiveLimit: new Decimal(20),
        kycRequiredLevel: null,
        eligibleRules: [{}],
        blockedByKycRules: [],
        rulesApplied: [{}],
        kycLevel: null,
      };
    }
    return {
      effectiveLimit: new Decimal(100),
      kycRequiredLevel: null,
      eligibleRules: [{}],
      blockedByKycRules: [],
      rulesApplied: [{}],
      kycLevel: null,
    };
  };

  const { service, prisma } = createServiceWithResolverBehavior(behavior);
  prisma.instrument.data.push({ id: 'coin-1', type: InstrumentType.COIN });

  const result = await service.reserve({
    userId: 'u1',
    action: PolicyAction.TRADE_BUY,
    metric: PolicyMetric.COUNT,
    period: PolicyPeriod.DAILY,
    amount: new Decimal(15),
    refId: 'coin-ref',
    refType: 'TEST',
    instrumentId: 'coin-1',
  });

  assert.strictEqual(result.usage.instrumentKey, 'coin-1');
  assert.strictEqual(result.usage.reservedAmount.toString(), '15');
});
