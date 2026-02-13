import {
  Prisma,
  PrismaClient,
  KycLevel,
  KycStatus,
  UserRole,
  UserStatus,
  InstrumentType,
  InstrumentUnit,
  PolicyAction,
  PolicyMetric,
  PolicyPeriod,
  PolicyScopeType,
  TradeSide,
  TradeStatus,
  SettlementMethod,
  DepositStatus,
  WithdrawStatus,
  RemittanceChannel,
  RemittanceGroupKind,
  RemittanceGroupStatus,
  RemittanceStatus,
  TxRefType,
  AccountTxType,
  AccountTxEntrySide,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type Summary = Record<string, { created: number; updated: number; skipped: number }>;
const summary: Summary = {};

function addSummary(section: string, delta: Partial<Summary[string]>) {
  summary[section] = summary[section] ?? { created: 0, updated: 0, skipped: 0 };
  summary[section].created += delta.created ?? 0;
  summary[section].updated += delta.updated ?? 0;
  summary[section].skipped += delta.skipped ?? 0;
}

function logSection(section: string, message: string) {
  console.log(`[seed] ${section}: ${message}`);
}

async function upsertUserByMobile(params: {
  mobile: string;
  create: {
    fullName: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    customerGroupId: string;
    tahesabCustomerCode?: string | null;
  };
  update: {
    fullName: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    customerGroupId: string;
    tahesabCustomerCode?: string | null;
  };
  hashedPassword: string;
}) {
  const existing = await prisma.user.findUnique({ where: { mobile: params.mobile } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { mobile: params.mobile },
      data: params.update,
    });
    addSummary('users', { updated: 1 });
    return updated;
  }

  const created = await prisma.user.create({
    data: {
      mobile: params.mobile,
      password: params.hashedPassword,
      ...params.create,
    },
  });
  addSummary('users', { created: 1 });
  return created;
}

async function main() {
  console.log('--- Start Seeding GoldNest Application ---');

  const hashedPassword = await bcrypt.hash('Password@123', 10);

  // 1) Instruments
  {
    const section = 'instruments';
    const instruments = [
      { code: 'IRR', name: 'ریال ایران', type: InstrumentType.FIAT, unit: InstrumentUnit.CURRENCY },
      { code: 'GOLD_750_EQ', name: 'طلای ۱۸ عیار گرمی', type: InstrumentType.GOLD, unit: InstrumentUnit.GRAM_750_EQ },
      { code: 'COIN_BAHAR', name: 'سکه بهار آزادی', type: InstrumentType.COIN, unit: InstrumentUnit.PIECE },
    ];

    for (const i of instruments) {
      const existing = await prisma.instrument.findUnique({ where: { code: i.code } });
      await prisma.instrument.upsert({ where: { code: i.code }, create: i, update: i });
      addSummary(section, existing ? { updated: 1 } : { created: 1 });
    }

    logSection(section, `created=${summary[section].created}, updated=${summary[section].updated}, skipped=${summary[section].skipped}`);
  }

  // 2) Customer Groups
  const groupByCode = new Map<string, string>();
  {
    const section = 'customerGroups';
    const groups = [
      { code: 'DEFAULT', name: 'Default Customers', tahesabGroupName: 'DEFAULT', isDefault: true },
      { code: 'VIP', name: 'VIP Customers', tahesabGroupName: 'VIP', isDefault: false },
      { code: 'BLOCKED_TEST', name: 'Blocked Test Group', tahesabGroupName: 'BLOCKED_TEST', isDefault: false },
    ];

    for (const g of groups) {
      const existing = await prisma.customerGroup.findUnique({ where: { code: g.code } });
      const row = await prisma.customerGroup.upsert({ where: { code: g.code }, create: g, update: g });
      groupByCode.set(g.code, row.id);
      addSummary(section, existing ? { updated: 1 } : { created: 1 });
    }

    await prisma.customerGroup.updateMany({ where: { code: { not: 'DEFAULT' } }, data: { isDefault: false } });
    logSection(section, `created=${summary[section].created}, updated=${summary[section].updated}, skipped=${summary[section].skipped}`);
  }

  // 3) CustomerGroupSettings
  {
    const section = 'customerGroupSettings';
    const defaultGroupId = groupByCode.get('DEFAULT')!;
    const vipGroupId = groupByCode.get('VIP')!;

    const targets = [
      { groupId: defaultGroupId, data: { showBalances: true as boolean | null, withdrawEnabled: null as boolean | null, tradeEnabled: null as boolean | null } },
      { groupId: vipGroupId, data: { showBalances: false, withdrawEnabled: false, tradeEnabled: true } },
    ];

    for (const t of targets) {
      const existing = await prisma.customerGroupSettings.findUnique({ where: { groupId: t.groupId } });
      await prisma.customerGroupSettings.upsert({
        where: { groupId: t.groupId },
        create: { groupId: t.groupId, ...t.data },
        update: t.data,
      });
      addSummary(section, existing ? { updated: 1 } : { created: 1 });
    }

    logSection(section, `created=${summary[section].created}, updated=${summary[section].updated}, skipped=${summary[section].skipped}`);
  }

  // 4) Users
  const usersByEmail = new Map<string, string>();
  {
    const section = 'users';
    const defaultGroupId = groupByCode.get('DEFAULT')!;
    const vipGroupId = groupByCode.get('VIP')!;

    const users = [
      {
        mobile: '09120000001',
        create: { fullName: 'System Admin', email: 'admin@goldnest.local', role: UserRole.ADMIN, status: UserStatus.ACTIVE, customerGroupId: defaultGroupId, tahesabCustomerCode: 'TC_ADMIN_001' },
        update: { fullName: 'System Admin', email: 'admin@goldnest.local', role: UserRole.ADMIN, status: UserStatus.ACTIVE, customerGroupId: defaultGroupId, tahesabCustomerCode: 'TC_ADMIN_001' },
      },
      {
        mobile: '09120000021',
        create: { fullName: 'Trader A - Verified FULL', email: 'trader.a@goldnest.local', role: UserRole.TRADER, status: UserStatus.ACTIVE, customerGroupId: defaultGroupId, tahesabCustomerCode: 'TC_TRADER_A' },
        update: { fullName: 'Trader A - Verified FULL', email: 'trader.a@goldnest.local', role: UserRole.TRADER, status: UserStatus.ACTIVE, customerGroupId: defaultGroupId, tahesabCustomerCode: 'TC_TRADER_A' },
      },
      {
        mobile: '09120000022',
        create: { fullName: 'Trader B - Pending KYC', email: 'trader.b@goldnest.local', role: UserRole.TRADER, status: UserStatus.ACTIVE, customerGroupId: defaultGroupId, tahesabCustomerCode: 'TC_TRADER_B' },
        update: { fullName: 'Trader B - Pending KYC', email: 'trader.b@goldnest.local', role: UserRole.TRADER, status: UserStatus.ACTIVE, customerGroupId: defaultGroupId, tahesabCustomerCode: 'TC_TRADER_B' },
      },
      {
        mobile: '09120000023',
        create: { fullName: 'Trader C - VIP', email: 'trader.c@goldnest.local', role: UserRole.TRADER, status: UserStatus.ACTIVE, customerGroupId: vipGroupId, tahesabCustomerCode: 'TC_TRADER_C' },
        update: { fullName: 'Trader C - VIP', email: 'trader.c@goldnest.local', role: UserRole.TRADER, status: UserStatus.ACTIVE, customerGroupId: vipGroupId, tahesabCustomerCode: 'TC_TRADER_C' },
      },
      {
        mobile: '09120000024',
        create: { fullName: 'Trader D - Blocked', email: 'trader.d@goldnest.local', role: UserRole.TRADER, status: UserStatus.BLOCKED, customerGroupId: defaultGroupId, tahesabCustomerCode: 'TC_TRADER_D' },
        update: { fullName: 'Trader D - Blocked', email: 'trader.d@goldnest.local', role: UserRole.TRADER, status: UserStatus.BLOCKED, customerGroupId: defaultGroupId, tahesabCustomerCode: 'TC_TRADER_D' },
      },
    ];

    for (const u of users) {
      const row = await upsertUserByMobile({ ...u, hashedPassword });
      usersByEmail.set(row.email, row.id);
    }

    logSection(section, `created=${summary[section].created}, updated=${summary[section].updated}, skipped=${summary[section].skipped}`);
  }

  // 5) User KYC
  {
    const section = 'userKyc';
    const rows = [
      { email: 'trader.a@goldnest.local', status: KycStatus.VERIFIED, level: KycLevel.FULL },
      { email: 'trader.b@goldnest.local', status: KycStatus.PENDING, level: KycLevel.BASIC },
      { email: 'trader.c@goldnest.local', status: KycStatus.VERIFIED, level: KycLevel.BASIC },
      { email: 'trader.d@goldnest.local', status: KycStatus.NONE, level: KycLevel.NONE },
    ];

    for (const r of rows) {
      const userId = usersByEmail.get(r.email);
      if (!userId) {
        addSummary(section, { skipped: 1 });
        continue;
      }
      const existing = await prisma.userKyc.findUnique({ where: { userId } });
      await prisma.userKyc.upsert({
        where: { userId },
        create: {
          userId,
          status: r.status,
          level: r.level,
          verifiedAt: r.status === KycStatus.VERIFIED ? new Date() : null,
        },
        update: {
          status: r.status,
          level: r.level,
          verifiedAt: r.status === KycStatus.VERIFIED ? new Date() : null,
          rejectedAt: null,
          rejectReason: null,
        },
      });
      addSummary(section, existing ? { updated: 1 } : { created: 1 });
    }

    logSection(section, `created=${summary[section].created}, updated=${summary[section].updated}, skipped=${summary[section].skipped}`);
  }

  // 6) User Settings
  {
    const section = 'userSettings';
    const targets = [
      { email: 'trader.a@goldnest.local', data: { showBalances: true, tradeEnabled: true } },
      { email: 'trader.c@goldnest.local', data: { tradeEnabled: false } },
    ];

    for (const t of targets) {
      const userId = usersByEmail.get(t.email);
      if (!userId) {
        addSummary(section, { skipped: 1 });
        continue;
      }
      const existing = await prisma.userSettings.findUnique({ where: { userId } });
      await prisma.userSettings.upsert({ where: { userId }, create: { userId, ...t.data }, update: t.data });
      addSummary(section, existing ? { updated: 1 } : { created: 1 });
    }

    logSection(section, `created=${summary[section].created}, updated=${summary[section].updated}, skipped=${summary[section].skipped}`);
  }

  // 7) Accounts with balances
  {
    const section = 'accounts';
    const irr = await prisma.instrument.findUnique({ where: { code: 'IRR' } });
    const gold = await prisma.instrument.findUnique({ where: { code: 'GOLD_750_EQ' } });

    if (!irr || !gold) {
      addSummary(section, { skipped: 1 });
      logSection(section, 'skipped=1 (missing instruments)');
    } else {
      const targets = [
        { email: 'trader.a@goldnest.local', irr: [100_000_000, 2_000_000, 500_000], gold: [25, 1, 0] },
        { email: 'trader.b@goldnest.local', irr: [3_000_000, 2_900_000, 200_000], gold: [1, 0.8, 0] },
        { email: 'trader.c@goldnest.local', irr: [40_000_000, 1_000_000, 0], gold: [10, 0, 0] },
        { email: 'trader.d@goldnest.local', irr: [500_000, 450_000, 100_000], gold: [0, 0, 0] },
      ];

      for (const t of targets) {
        const userId = usersByEmail.get(t.email);
        if (!userId) {
          addSummary(section, { skipped: 2 });
          continue;
        }

        for (const [instrumentId, values] of [
          [irr.id, t.irr],
          [gold.id, t.gold],
        ] as const) {
          const existing = await prisma.account.findUnique({ where: { userId_instrumentId: { userId, instrumentId } } });
          await prisma.account.upsert({
            where: { userId_instrumentId: { userId, instrumentId } },
            create: {
              userId,
              instrumentId,
              balance: new Prisma.Decimal(values[0]),
              blockedBalance: new Prisma.Decimal(values[1]),
              minBalance: new Prisma.Decimal(values[2]),
            },
            update: {
              balance: new Prisma.Decimal(values[0]),
              blockedBalance: new Prisma.Decimal(values[1]),
              minBalance: new Prisma.Decimal(values[2]),
            },
          });
          addSummary(section, existing ? { updated: 1 } : { created: 1 });
        }
      }

      logSection(section, `created=${summary[section].created}, updated=${summary[section].updated}, skipped=${summary[section].skipped}`);
    }
  }

  // 8) Baseline policy rules
  {
    const section = 'policyRules';
    const vipGroupId = groupByCode.get('VIP');

    const rules = [
      {
        scopeType: PolicyScopeType.GLOBAL,
        scopeUserId: null,
        scopeGroupId: null,
        action: PolicyAction.WITHDRAW_IRR,
        metric: PolicyMetric.NOTIONAL_IRR,
        period: PolicyPeriod.DAILY,
        limit: new Prisma.Decimal('50000000'),
        minKycLevel: KycLevel.FULL,
        enabled: true,
        priority: 10,
      },
      {
        scopeType: PolicyScopeType.GLOBAL,
        scopeUserId: null,
        scopeGroupId: null,
        action: PolicyAction.TRADE_BUY,
        metric: PolicyMetric.NOTIONAL_IRR,
        period: PolicyPeriod.DAILY,
        limit: new Prisma.Decimal('300000000'),
        minKycLevel: KycLevel.BASIC,
        enabled: true,
        priority: 20,
      },
      {
        scopeType: PolicyScopeType.GLOBAL,
        scopeUserId: null,
        scopeGroupId: null,
        action: PolicyAction.TRADE_SELL,
        metric: PolicyMetric.NOTIONAL_IRR,
        period: PolicyPeriod.DAILY,
        limit: new Prisma.Decimal('300000000'),
        minKycLevel: KycLevel.BASIC,
        enabled: true,
        priority: 20,
      },
      ...(vipGroupId
        ? [
            {
              scopeType: PolicyScopeType.GROUP,
              scopeUserId: null,
              scopeGroupId: vipGroupId,
              action: PolicyAction.WITHDRAW_IRR,
              metric: PolicyMetric.NOTIONAL_IRR,
              period: PolicyPeriod.DAILY,
              limit: new Prisma.Decimal('10000000'),
              minKycLevel: KycLevel.FULL,
              enabled: true,
              priority: 5,
            },
          ]
        : []),
    ];

    for (const rule of rules) {
      const existing = await prisma.policyRule.findFirst({
        where: {
          scopeType: rule.scopeType,
          scopeUserId: rule.scopeUserId,
          scopeGroupId: rule.scopeGroupId,
          action: rule.action,
          metric: rule.metric,
          period: rule.period,
          productId: null,
          instrumentId: null,
          instrumentType: null,
        },
      });

      if (existing) {
        await prisma.policyRule.update({
          where: { id: existing.id },
          data: {
            limit: rule.limit,
            minKycLevel: rule.minKycLevel,
            enabled: rule.enabled,
            priority: rule.priority,
          },
        });
        addSummary(section, { updated: 1 });
      } else {
        await prisma.policyRule.create({ data: rule });
        addSummary(section, { created: 1 });
      }
    }

    logSection(section, `created=${summary[section].created}, updated=${summary[section].updated}, skipped=${summary[section].skipped}`);
  }

  // 9) Transactional demo section (skip if already present)
  {
    const section = 'transactionalDemo';
    const existingTrades = await prisma.trade.count();
    if (existingTrades > 0) {
      addSummary(section, { skipped: 1 });
      logSection(section, 'skipped=1 (existing trades detected)');
    } else {
      const traderAId = usersByEmail.get('trader.a@goldnest.local');
      const traderBId = usersByEmail.get('trader.b@goldnest.local');
      const adminId = usersByEmail.get('admin@goldnest.local');
      const irr = await prisma.instrument.findUnique({ where: { code: 'IRR' } });
      const gold = await prisma.instrument.findUnique({ where: { code: 'GOLD_750_EQ' } });

      if (!traderAId || !traderBId || !adminId || !irr || !gold) {
        addSummary(section, { skipped: 1 });
        logSection(section, 'skipped=1 (missing prerequisites)');
      } else {
        const trade = await prisma.trade.create({
          data: {
            clientId: traderAId,
            instrumentId: gold.id,
            side: TradeSide.BUY,
            status: TradeStatus.APPROVED,
            settlementMethod: SettlementMethod.WALLET,
            quantity: new Prisma.Decimal('1.2'),
            pricePerUnit: new Prisma.Decimal('3500000'),
            totalAmount: new Prisma.Decimal('4200000'),
            approvedById: adminId,
            approvedAt: new Date(),
            clientNote: 'Seed demo trade',
          },
        });

        const dep = await prisma.depositRequest.create({
          data: {
            userId: traderAId,
            amount: new Prisma.Decimal('5000000'),
            method: 'بانکی',
            status: DepositStatus.PENDING,
            refNo: `seed-ref-${Date.now()}`,
            note: 'Seed demo deposit',
          },
        });

        const account = await prisma.account.findFirst({ where: { userId: traderAId, instrumentId: irr.id } });
        if (account) {
          const tx = await prisma.accountTx.create({
            data: {
              accountId: account.id,
              delta: new Prisma.Decimal('-1000000'),
              type: AccountTxType.WITHDRAW,
              entrySide: AccountTxEntrySide.DEBIT,
              refType: TxRefType.WITHDRAW,
              createdById: adminId,
            },
          });
          await prisma.withdrawRequest.create({
            data: {
              userId: traderAId,
              amount: new Prisma.Decimal('1000000'),
              status: WithdrawStatus.APPROVED,
              processedById: adminId,
              processedAt: new Date(),
              accountTxId: tx.id,
            },
          });
        }

        await prisma.remittanceGroup.create({
          data: {
            createdByUserId: traderAId,
            kind: RemittanceGroupKind.TRANSFER,
            status: RemittanceGroupStatus.CLOSED,
            note: 'Seed demo remittance group',
            legs: {
              create: {
                fromUserId: traderAId,
                toUserId: traderBId,
                instrumentId: irr.id,
                amount: new Prisma.Decimal('250000'),
                channel: RemittanceChannel.INTERNAL,
                status: RemittanceStatus.COMPLETED,
                note: 'Seed demo remittance',
              },
            },
          },
        });

        addSummary(section, { created: 4 });
        logSection(section, `created=${summary[section].created}, updated=${summary[section].updated}, skipped=${summary[section].skipped}`);
        logSection(section, `demoTradeId=${trade.id}, demoDepositId=${dep.id}`);
      }
    }
  }

  console.log('[seed] summary:', summary);
  console.log('--- Seeding finished successfully! ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
