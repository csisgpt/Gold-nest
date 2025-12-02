import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { DepositStatus, UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DecisionDto } from './dto/decision.dto';
import { DepositsService } from './deposits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';

@ApiTags('deposits')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post('deposits')
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateDepositDto, @CurrentUser() user: JwtRequestUser) {
    return this.depositsService.createForUser(user.id, dto);
  }

  @Get('deposits/my/:userId')
  @UseGuards(JwtAuthGuard)
  listMy(@Param('userId') _userId: string, @CurrentUser() user: JwtRequestUser) {
    return this.depositsService.findMy(user.id);
  }

  @Get('deposits/my')
  @UseGuards(JwtAuthGuard)
  listMyAuthenticated(@CurrentUser() user: JwtRequestUser) {
    return this.depositsService.findMy(user.id);
  }

  @Get('admin/deposits')
  @Roles(UserRole.ADMIN)
  listAdmin(@Query('status') status?: DepositStatus) {
    return this.depositsService.findByStatus(status);
  }

  @Post('admin/deposits/:id/approve')
  @Roles(UserRole.ADMIN)
  approve(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() admin: JwtRequestUser) {
    return this.depositsService.approve(id, dto, admin.id);
  }

  @Post('admin/deposits/:id/reject')
  @Roles(UserRole.ADMIN)
  reject(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() admin: JwtRequestUser) {
    return this.depositsService.reject(id, dto, admin.id);
  }
}
