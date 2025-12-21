import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { UserSettingsService } from './user-settings.service';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';

@ApiTags('user-settings')
@ApiBearerAuth('access-token')
@Controller()
export class UserSettingsController {
  constructor(private readonly userSettingsService: UserSettingsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('users/me/settings')
  getMySettings(@CurrentUser() user: JwtRequestUser) {
    return this.userSettingsService.getForUser(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('users/me/settings')
  updateMySettings(@CurrentUser() user: JwtRequestUser, @Body() dto: UpdateUserSettingsDto) {
    return this.userSettingsService.upsert(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/users/:userId/settings')
  getAdmin(@Param('userId') userId: string) {
    return this.userSettingsService.getForUser(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put('admin/users/:userId/settings')
  setAdmin(@Param('userId') userId: string, @Body() dto: UpdateUserSettingsDto) {
    return this.userSettingsService.upsert(userId, dto);
  }
}
