import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { USER_SETTINGS_DEFAULTS } from './user-settings.constants';

@Injectable()
export class UserSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string) {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (settings) return settings;
    return { userId, ...USER_SETTINGS_DEFAULTS };
  }

  upsert(userId: string, dto: UpdateUserSettingsDto) {
    const data = { ...USER_SETTINGS_DEFAULTS, ...dto };
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
