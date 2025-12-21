import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';

const DEFAULT_SETTINGS = {
  showBalances: true,
  showGold: true,
  showCoins: true,
  showCash: true,
  tradeEnabled: true,
  withdrawEnabled: true,
  maxOpenTrades: null as number | null,
};

@Injectable()
export class UserSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string) {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (settings) return settings;
    return { userId, ...DEFAULT_SETTINGS };
  }

  upsert(userId: string, dto: UpdateUserSettingsDto) {
    const data = { ...DEFAULT_SETTINGS, ...dto };
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
