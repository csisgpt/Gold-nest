import { Injectable, Scope } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { USER_SETTINGS_DEFAULTS } from './user-settings.constants';
import {
  EffectiveUserSettings,
  EffectiveUserSettingsSource,
  EffectiveUserSettingsWithSources,
} from './user-settings.types';

@Injectable({ scope: Scope.REQUEST })
export class EffectiveSettingsService {
  private readonly cache = new Map<string, EffectiveUserSettingsWithSources>();

  constructor(private readonly prisma: PrismaService) {}

  async getEffective(userId: string): Promise<EffectiveUserSettings> {
    const data = await this.getEffectiveWithSources(userId);
    return data.effective;
  }

  async getEffectiveWithSources(userId: string): Promise<EffectiveUserSettingsWithSources> {
    const cached = this.cache.get(userId);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { customerGroupId: true },
    });

    const [groupSettings, userSettings] = await Promise.all([
      user?.customerGroupId
        ? this.prisma.customerGroupSettings.findUnique({ where: { groupId: user.customerGroupId } })
        : Promise.resolve(null),
      this.prisma.userSettings.findUnique({ where: { userId } }),
    ]);

    const defaults = USER_SETTINGS_DEFAULTS;
    const fields: Array<keyof EffectiveUserSettings> = [
      'showBalances',
      'showGold',
      'showCoins',
      'showCash',
      'tradeEnabled',
      'withdrawEnabled',
      'maxOpenTrades',
      'metaJson',
    ];

    const effective: EffectiveUserSettings = { ...defaults };
    const sources = {} as Record<keyof EffectiveUserSettings, EffectiveUserSettingsSource>;

    for (const field of fields) {
      const userValue = userSettings?.[field as keyof typeof userSettings];
      const groupValue = groupSettings?.[field as keyof typeof groupSettings];

      if (userValue !== undefined && userValue !== null) {
        (effective as any)[field] = userValue;
        sources[field] = 'USER';
      } else if (groupValue !== undefined && groupValue !== null) {
        (effective as any)[field] = groupValue;
        sources[field] = 'GROUP';
      } else {
        (effective as any)[field] = defaults[field];
        sources[field] = 'DEFAULT';
      }
    }

    const result: EffectiveUserSettingsWithSources = { effective, sources };
    this.cache.set(userId, result);
    return result;
  }
}
