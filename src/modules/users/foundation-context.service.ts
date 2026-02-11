import { Injectable, NotFoundException, Scope } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { KycLevel, PolicyAction, PolicyMetric, PolicyPeriod, UserStatus } from '@prisma/client';
import { ApiErrorCode } from '../../common/http/api-error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { mapWalletAccountDto } from '../accounts/mappers/wallet-account.mapper';
import { IRR_INSTRUMENT_CODE } from '../accounts/constants';
import { PolicyResolutionService } from '../policy/policy-resolution.service';
import { EffectiveSettingsService } from '../user-settings/effective-settings.service';

@Injectable({ scope: Scope.REQUEST })
export class FoundationContextService {
  private readonly cache = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: EffectiveSettingsService,
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

    const balancesHiddenByUserSetting = !effective.showBalances;
    const hideBalances = !includeHiddenForAdmin && balancesHiddenByUserSetting;
    const mapped = accounts.map((account) => mapWalletAccountDto(account, hideBalances));

    const irr = accounts.find((a) => a.instrument.code === IRR_INSTRUMENT_CODE);
    const irrAvailable = irr
      ? new Decimal(irr.balance).minus(irr.blockedBalance).minus(irr.minBalance).toString()
      : null;

    return {
      accounts: mapped,
      summary: {
        balancesHiddenByUserSetting,
        irrAvailable: hideBalances ? null : irrAvailable,
      },
    };
  }

  async getPolicySummary(userId: string) {
    const build = async (action: PolicyAction, metric: PolicyMetric, period: PolicyPeriod) => {
      const resolved = await this.policyResolution.resolve({ action, metric, period, context: { userId } });
      return {
        limit: resolved.value?.toString() ?? null,
        kycRequiredLevel: resolved.kycRequiredLevel,
        ruleId: resolved.ruleId,
        source: resolved.source,
      };
    };

    const summary = {
      withdrawIrr: {
        daily: await build(PolicyAction.WITHDRAW_IRR, PolicyMetric.NOTIONAL_IRR, PolicyPeriod.DAILY),
        monthly: await build(PolicyAction.WITHDRAW_IRR, PolicyMetric.NOTIONAL_IRR, PolicyPeriod.MONTHLY),
      },
      tradeBuyNotionalIrr: {
        daily: await build(PolicyAction.TRADE_BUY, PolicyMetric.NOTIONAL_IRR, PolicyPeriod.DAILY),
        monthly: await build(PolicyAction.TRADE_BUY, PolicyMetric.NOTIONAL_IRR, PolicyPeriod.MONTHLY),
      },
      tradeSellNotionalIrr: {
        daily: await build(PolicyAction.TRADE_SELL, PolicyMetric.NOTIONAL_IRR, PolicyPeriod.DAILY),
        monthly: await build(PolicyAction.TRADE_SELL, PolicyMetric.NOTIONAL_IRR, PolicyPeriod.MONTHLY),
      },
    };

    return {
      ...summary,
      withdraw: summary.withdrawIrr,
      tradeBuy: summary.tradeBuyNotionalIrr,
      tradeSell: summary.tradeSellNotionalIrr,
    };
  }

  async getCapabilities(userId: string) {
    const [ctx, wallet] = await Promise.all([this.getUserContext(userId), this.getWalletSummary(userId)]);
    const reasons: Array<{ code: string; message: string; hint?: string }> = [];
    const reasonCodes = new Set<string>();
    const pushReason = (code: string, message: string, hint?: string) => {
      if (reasonCodes.has(code)) return;
      reasonCodes.add(code);
      reasons.push({ code, message, hint });
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
    const needsKycForTrade = maxKyc(policyRequired[2].kycRequiredLevel, policyRequired[3].kycRequiredLevel, policyRequired[4].kycRequiredLevel, policyRequired[5].kycRequiredLevel);
    const effectiveUserKyc = ctx.kyc?.status === 'VERIFIED' ? ctx.kyc.level : KycLevel.NONE;

    let canTrade = ctx.user.status === UserStatus.ACTIVE && ctx.settings.effective.tradeEnabled;
    let canWithdraw = ctx.user.status === UserStatus.ACTIVE && ctx.settings.effective.withdrawEnabled;

    if (ctx.user.status !== UserStatus.ACTIVE) pushReason('USER_BLOCKED', 'User is not active');
    if (!ctx.settings.effective.tradeEnabled) pushReason('SETTINGS_TRADE_DISABLED', 'Trade is disabled in user settings');
    if (!ctx.settings.effective.withdrawEnabled) pushReason('SETTINGS_WITHDRAW_DISABLED', 'Withdraw is disabled in user settings');

    if (needsKycForWithdraw !== KycLevel.NONE && kycOrder.indexOf(effectiveUserKyc) < kycOrder.indexOf(needsKycForWithdraw)) {
      canWithdraw = false;
      const code = needsKycForWithdraw === KycLevel.FULL ? 'KYC_REQUIRED_FULL' : 'KYC_REQUIRED_BASIC';
      pushReason(code, `KYC level ${needsKycForWithdraw} required for withdraw`, 'Submit and verify KYC to unlock withdrawals.');
    }

    if (needsKycForTrade !== KycLevel.NONE && kycOrder.indexOf(effectiveUserKyc) < kycOrder.indexOf(needsKycForTrade)) {
      canTrade = false;
      const code = needsKycForTrade === KycLevel.FULL ? 'KYC_REQUIRED_FULL' : 'KYC_REQUIRED_BASIC';
      pushReason(code, `KYC level ${needsKycForTrade} required for trade`, 'Submit and verify KYC to unlock trading.');
    }

    const irrAvailable = wallet.summary.irrAvailable ? new Decimal(wallet.summary.irrAvailable) : new Decimal(0);
    if (canWithdraw && irrAvailable.lte(0)) {
      canWithdraw = false;
      pushReason('INSUFFICIENT_AVAILABLE_IRR', 'Insufficient available IRR balance for withdrawal');
    }

    return { canTrade, canWithdraw, reasons, needsKycForWithdraw, needsKycForTrade };
  }
}
