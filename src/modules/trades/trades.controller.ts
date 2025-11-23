import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TradeStatus } from '@prisma/client';
import { CreateTradeDto } from './dto/create-trade.dto';
import { ApproveTradeDto } from './dto/approve-trade.dto';
import { RejectTradeDto } from './dto/reject-trade.dto';
import { TradesService } from './trades.service';

@Controller()
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Post('trades')
  create(@Body() dto: CreateTradeDto) {
    return this.tradesService.create(dto);
  }

  @Get('trades/my/:userId')
  listMy(@Param('userId') userId: string) {
    return this.tradesService.findMy(userId);
  }

  @Get('admin/trades')
  listAdmin(@Query('status') status?: TradeStatus) {
    return this.tradesService.findByStatus(status);
  }

  @Post('admin/trades/:id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveTradeDto) {
    return this.tradesService.approve(id, dto);
  }

  @Post('admin/trades/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectTradeDto) {
    return this.tradesService.reject(id, dto);
  }
}
