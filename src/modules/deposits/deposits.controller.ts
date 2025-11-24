import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { DepositStatus, UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DecisionDto } from './dto/decision.dto';
import { DepositsService } from './deposits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('deposits')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post('deposits')
  create(@Body() dto: CreateDepositDto) {
    return this.depositsService.create(dto);
  }

  @Get('deposits/my/:userId')
  listMy(@Param('userId') userId: string) {
    return this.depositsService.findMy(userId);
  }

  @Get('admin/deposits')
  @Roles(UserRole.ADMIN)
  listAdmin(@Query('status') status?: DepositStatus) {
    return this.depositsService.findByStatus(status);
  }

  @Post('admin/deposits/:id/approve')
  @Roles(UserRole.ADMIN)
  approve(@Param('id') id: string, @Body() dto: DecisionDto) {
    return this.depositsService.approve(id, dto);
  }

  @Post('admin/deposits/:id/reject')
  @Roles(UserRole.ADMIN)
  reject(@Param('id') id: string, @Body() dto: DecisionDto) {
    return this.depositsService.reject(id, dto);
  }
}
