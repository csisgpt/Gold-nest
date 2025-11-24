import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole, WithdrawStatus } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DecisionDto } from '../deposits/dto/decision.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalsService } from './withdrawals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('withdrawals')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post('withdrawals')
  create(@Body() dto: CreateWithdrawalDto) {
    return this.withdrawalsService.create(dto);
  }

  @Get('withdrawals/my/:userId')
  listMy(@Param('userId') userId: string) {
    return this.withdrawalsService.findMy(userId);
  }

  @Get('admin/withdrawals')
  @Roles(UserRole.ADMIN)
  listAdmin(@Query('status') status?: WithdrawStatus) {
    return this.withdrawalsService.findByStatus(status);
  }

  @Post('admin/withdrawals/:id/approve')
  @Roles(UserRole.ADMIN)
  approve(@Param('id') id: string, @Body() dto: DecisionDto) {
    return this.withdrawalsService.approve(id, dto);
  }

  @Post('admin/withdrawals/:id/reject')
  @Roles(UserRole.ADMIN)
  reject(@Param('id') id: string, @Body() dto: DecisionDto) {
    return this.withdrawalsService.reject(id, dto);
  }
}
