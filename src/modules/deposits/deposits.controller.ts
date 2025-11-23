import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DepositStatus } from '@prisma/client';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DecisionDto } from './dto/decision.dto';
import { DepositsService } from './deposits.service';

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
  listAdmin(@Query('status') status?: DepositStatus) {
    return this.depositsService.findByStatus(status);
  }

  @Post('admin/deposits/:id/approve')
  approve(@Param('id') id: string, @Body() dto: DecisionDto) {
    return this.depositsService.approve(id, dto);
  }

  @Post('admin/deposits/:id/reject')
  reject(@Param('id') id: string, @Body() dto: DecisionDto) {
    return this.depositsService.reject(id, dto);
  }
}
