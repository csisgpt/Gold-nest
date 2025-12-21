import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RedisService } from './redis.service';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { RolesGuard } from '../../modules/auth/roles.guard';
import { Roles } from '../../modules/auth/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('health')
@Controller('health')
export class RedisHealthController {
  constructor(private readonly redisService: RedisService) {}

  @Get('redis')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async health() {
    return this.redisService.health();
  }
}
