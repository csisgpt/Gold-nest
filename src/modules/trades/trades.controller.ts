import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TradeStatus, UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateTradeDto } from './dto/create-trade.dto';
import { ApproveTradeDto } from './dto/approve-trade.dto';
import { RejectTradeDto } from './dto/reject-trade.dto';
import { TradesService } from './trades.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('trades')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @ApiOperation({ summary: 'Create a new trade' })
  @ApiResponse({ status: 201, description: 'Trade created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation or business rule error.' })
  @Post('trades')
  @Roles(UserRole.CLIENT, UserRole.TRADER, UserRole.ADMIN)
  create(@Body() dto: CreateTradeDto) {
    return this.tradesService.create(dto);
  }

  @Get('trades/my/:userId')
  listMy(@Param('userId') userId: string) {
    return this.tradesService.findMy(userId);
  }

  @Get('admin/trades')
  @Roles(UserRole.ADMIN)
  listAdmin(@Query('status') status?: TradeStatus) {
    return this.tradesService.findByStatus(status);
  }

  @ApiOperation({ summary: 'Approve a trade' })
  @ApiResponse({ status: 200, description: 'Trade approved.' })
  @Post('admin/trades/:id/approve')
  @Roles(UserRole.ADMIN)
  approve(@Param('id') id: string, @Body() dto: ApproveTradeDto) {
    return this.tradesService.approve(id, dto);
  }

  @ApiOperation({ summary: 'Reject a trade' })
  @ApiResponse({ status: 200, description: 'Trade rejected.' })
  @Post('admin/trades/:id/reject')
  @Roles(UserRole.ADMIN)
  reject(@Param('id') id: string, @Body() dto: RejectTradeDto) {
    return this.tradesService.reject(id, dto);
  }
}
