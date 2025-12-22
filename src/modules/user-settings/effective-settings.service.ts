import { Injectable, Scope } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { USER_SETTINGS_DEFAULTS } from './user-settings.constants';
import { EffectiveUserSettings } from './user-settings.types';

@Injectable({ scope: Scope.REQUEST })
export class EffectiveSettingsService {
  private readonly cache = new Map<string, EffectiveUserSettings>();

  constructor(private readonly prisma: PrismaService) {}

  async getEffective(userId: string): Promise<EffectiveUserSettings> {
    const cached = this.cache.get(userId);
    if (cached) return cached;

    const stored = await this.prisma.userSettings.findUnique({ where: { userId } });
    const effective: EffectiveUserSettings = {
      ...USER_SETTINGS_DEFAULTS,
      ...(stored
        ? {
            showBalances: stored.showBalances,
            showGold: stored.showGold,
            showCoins: stored.showCoins,
            showCash: stored.showCash,
            tradeEnabled: stored.tradeEnabled,
            withdrawEnabled: stored.withdrawEnabled,
            maxOpenTrades: stored.maxOpenTrades ?? null,
            metaJson: stored.metaJson as any,
          }
        : {}),
    };

    this.cache.set(userId, effective);
    return effective;
  }
}
