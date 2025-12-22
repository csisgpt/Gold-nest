import { Module } from '@nestjs/common';
import { UserSettingsService } from './user-settings.service';
import { UserSettingsController } from './user-settings.controller';
import { EffectiveSettingsService } from './effective-settings.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [UserSettingsService, EffectiveSettingsService],
  controllers: [UserSettingsController],
  exports: [UserSettingsService, EffectiveSettingsService],
})
export class UserSettingsModule {}
