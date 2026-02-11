import { Injectable, Scope } from '@nestjs/common';
import { PolicyAction, PolicyMetric, PolicyPeriod, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EffectiveSettingsService } from '../user-settings/effective-settings.service';
import { AccountsService } from '../accounts/accounts.service';
import { PolicyResolutionService } from '../policy/policy-resolution.service';
import { IRR_INSTRUMENT_CODE } from '../accounts/constants';

@Injectable({ scope: Scope.REQUEST })
export class FoundationContextService {
  private readonly cache = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: EffectiveSettingsService,
    private readonly accountsService: AccountsService,
    private readonly policyResolution: PolicyResolutionService,
  ) {}

  async getUserContext(userId: string) {
    const key = `ctx:${userId}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customerGroup: true, userKyc: true },
    });
    if (!user) throw new Error('USER_NOT_FOUND');

    const settings = await this.settings.getEffectiveWithSources(userId);
    const result = {
      user: {
        id: user.id,
        role: user.role,
        status: user.status,
        customerGroupId: user.customerGroupId,
        tahesabCustomerCode: user.tahesabCustomerCode,
      },
      kyc: user.userKyc,
      settings,
    };

    this.cache.set(key, result);
    return result;
  }

  async getWalletSummary(userId: string, includeHiddenForAdmin = false) {
    const [accounts, effective] = await Promise.all([
      this.prisma.account.findMany({ where: { userId }, include: { instrument: true } }),
      this.settings.getEffective(userId),
    ]);

    const balancesHidden = !includeHiddenForAdmin && !effective.showBalances;
    const mapped = accounts.map((account) => ({
      instrumentCode: account.instrument.code,
      instrumentName: account.instrument.name,
      balance: balancesHidden ? null : account.balance.toString(),
      blockedBalance: balancesHidden ? null : account.blockedBalance.toString(),
      minBalance: balancesHidden ? null : account.minBalance.toString(),
      available: balancesHidden ? null : this.accountsService.getUsableCapacity(account).toString(),
    }));

    const irr = accounts.find((a) => a.instrument.code === IRR_INSTRUMENT_CODE);
    return {
      accounts: mapped,
      summary: {
        balancesHidden,
        irrAvailable: irr ? (balancesHidden ? null : this.accountsService.getUsableCapacity(irr).toString()) : null,
      },
    };
  }

  async getPolicySummary(userId: string) {
    const build = async (action: PolicyAction, metric: PolicyMetric, period: PolicyPeriod) => {
      const resolved = await this.policyResolution.resolve({
        action,
        metric,
        period,
        context: { userId },
      });
      return {
        limit: resolved.value?.toString() ?? null,
        kycRequiredLevel: resolved.kycRequiredLevel,
        ruleId: resolved.ruleId,
        source: resolved.source,
      };
    };

    return {
      withdraw: {
        daily: await build(PolicyAction.WITHDRAW_IRR, PolicyMetric.NOTIONAL_IRR, PolicyPeriod.DAILY),
        monthly: await build(PolicyAction.WITHDRAW_IRR, PolicyMetric.NOTIONAL_IRR, PolicyPeriod.MONTHLY),
      },
      tradeBuy: {
        daily: await build(PolicyAction.TRADE_BUY, PolicyMetric.NOTIONAL_IRR, PolicyPeriod.DAILY),
        monthly: await build(PolicyAction.TRADE_BUY, PolicyMetric.NOTIONAL_IRR, PolicyPeriod.MONTHLY),
      },
      tradeSell: {
        daily: await build(PolicyAction.TRADE_SELL, PolicyMetric.NOTIONAL_IRR, PolicyPeriod.DAILY),
        monthly: await build(PolicyAction.TRADE_SELL, PolicyMetric.NOTIONAL_IRR, PolicyPeriod.MONTHLY),
      },
    };
  }

  async getCapabilities(userId: string) {
    const ctx = await this.getUserContext(userId);
    const reasons: Array<{ code: string; message: string }> = [];

    const canTrade = ctx.user.status === UserStatus.ACTIVE && ctx.settings.effective.tradeEnabled;
    const canWithdraw = ctx.user.status === UserStatus.ACTIVE && ctx.settings.effective.withdrawEnabled;

    if (ctx.user.status !== UserStatus.ACTIVE) {
      reasons.push({ code: 'USER_BLOCKED', message: 'User is not active' });
    }
    if (!ctx.settings.effective.tradeEnabled) reasons.push({ code: 'TRADE_DISABLED', message: 'Trade disabled in settings' });
    if (!ctx.settings.effective.withdrawEnabled) reasons.push({ code: 'WITHDRAW_DISABLED', message: 'Withdraw disabled in settings' });

    return { canTrade, canWithdraw, reasons };
  }
}
