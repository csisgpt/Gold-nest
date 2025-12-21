import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateGoldLotDto } from './dto/create-gold-lot.dto';
import { GoldService } from './gold.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';

@ApiTags('gold')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class GoldController {
  constructor(private readonly goldService: GoldService) {}

  @Post('gold/lots')
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateGoldLotDto, @CurrentUser() admin: JwtRequestUser) {
    return this.goldService.createLot(dto, admin);
  }

  @Get('gold/lots/my')
  listMy(@CurrentUser() user: JwtRequestUser) {
    return this.goldService.findByUser(user.id);
  }

  @Get('gold/lots/user/:userId')
  @Roles(UserRole.ADMIN)
  listByUser(@Param('userId') userId: string) {
    return this.goldService.findByUser(userId);
  }
}
