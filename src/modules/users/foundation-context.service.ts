import { Injectable, NotFoundException, Scope } from '@nestjs/common';
import { KycLevel, PolicyAction, PolicyMetric, PolicyPeriod, UserStatus } from '@prisma/client';
import { ApiErrorCode } from '../../common/http/api-error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { IRR_INSTRUMENT_CODE } from '../accounts/constants';
import { PolicyResolutionService } from '../policy/policy-resolution.service';
import { EffectiveSettingsService } from '../user-settings/effective-settings.service';

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
    if (!user) {
      throw new NotFoundException({ code: ApiErrorCode.USER_NOT_FOUND, message: 'User not found' });
    }

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
    const reasonCodes = new Set<string>();
    const pushReason = (code: string, message: string) => {
      if (reasonCodes.has(code)) return;
      reasonCodes.add(code);
      reasons.push({ code, message });
    };

    const policyRequired = await Promise.all([
      this.policyResolution.resolve({ action: PolicyAction.WITHDRAW_IRR, metric: PolicyMetric.NOTIONAL_IRR, period: PolicyPeriod.DAILY, context: { userId } }),
      this.policyResolution.resolve({ action: PolicyAction.WITHDRAW_IRR, metric: PolicyMetric.NOTIONAL_IRR, period: PolicyPeriod.MONTHLY, context: { userId } }),
      this.policyResolution.resolve({ action: PolicyAction.TRADE_BUY, metric: PolicyMetric.NOTIONAL_IRR, period: PolicyPeriod.DAILY, context: { userId } }),
      this.policyResolution.resolve({ action: PolicyAction.TRADE_BUY, metric: PolicyMetric.NOTIONAL_IRR, period: PolicyPeriod.MONTHLY, context: { userId } }),
      this.policyResolution.resolve({ action: PolicyAction.TRADE_SELL, metric: PolicyMetric.NOTIONAL_IRR, period: PolicyPeriod.DAILY, context: { userId } }),
      this.policyResolution.resolve({ action: PolicyAction.TRADE_SELL, metric: PolicyMetric.NOTIONAL_IRR, period: PolicyPeriod.MONTHLY, context: { userId } }),
    ]);

    const kycOrder: KycLevel[] = [KycLevel.NONE, KycLevel.BASIC, KycLevel.FULL];
    const maxKyc = (...levels: Array<KycLevel | null>) => {
      return levels.reduce<KycLevel>((acc, current) => {
        if (!current) return acc;
        return kycOrder.indexOf(current) > kycOrder.indexOf(acc) ? current : acc;
      }, KycLevel.NONE);
    };

    const needsKycForWithdraw = maxKyc(policyRequired[0].kycRequiredLevel, policyRequired[1].kycRequiredLevel);
    const needsKycForTrade = maxKyc(
      policyRequired[2].kycRequiredLevel,
      policyRequired[3].kycRequiredLevel,
      policyRequired[4].kycRequiredLevel,
      policyRequired[5].kycRequiredLevel,
    );

    const effectiveUserKyc = ctx.kyc?.status === 'VERIFIED' ? ctx.kyc.level : KycLevel.NONE;

    let canTrade = ctx.user.status === UserStatus.ACTIVE && ctx.settings.effective.tradeEnabled;
    let canWithdraw = ctx.user.status === UserStatus.ACTIVE && ctx.settings.effective.withdrawEnabled;

    if (ctx.user.status !== UserStatus.ACTIVE) {
      pushReason('USER_BLOCKED', 'User is not active');
    }
    if (!ctx.settings.effective.tradeEnabled) pushReason('TRADE_DISABLED', 'Trade disabled in settings');
    if (!ctx.settings.effective.withdrawEnabled) pushReason('WITHDRAW_DISABLED', 'Withdraw disabled in settings');

    if (needsKycForWithdraw !== KycLevel.NONE && kycOrder.indexOf(effectiveUserKyc) < kycOrder.indexOf(needsKycForWithdraw)) {
      canWithdraw = false;
      pushReason('KYC_REQUIRED', `KYC level ${needsKycForWithdraw} required for withdraw`);
    }

    if (needsKycForTrade !== KycLevel.NONE && kycOrder.indexOf(effectiveUserKyc) < kycOrder.indexOf(needsKycForTrade)) {
      canTrade = false;
      pushReason('KYC_REQUIRED', `KYC level ${needsKycForTrade} required for trade`);
    }

    return { canTrade, canWithdraw, reasons, needsKycForWithdraw, needsKycForTrade };
  }
}
