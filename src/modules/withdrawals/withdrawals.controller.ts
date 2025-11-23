import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { WithdrawStatus } from '@prisma/client';
import { DecisionDto } from '../deposits/dto/decision.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalsService } from './withdrawals.service';

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
  listAdmin(@Query('status') status?: WithdrawStatus) {
    return this.withdrawalsService.findByStatus(status);
  }

  @Post('admin/withdrawals/:id/approve')
  approve(@Param('id') id: string, @Body() dto: DecisionDto) {
    return this.withdrawalsService.approve(id, dto);
  }

  @Post('admin/withdrawals/:id/reject')
  reject(@Param('id') id: string, @Body() dto: DecisionDto) {
    return this.withdrawalsService.reject(id, dto);
  }
}
