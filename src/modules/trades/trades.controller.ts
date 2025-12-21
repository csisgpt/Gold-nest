import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateTradeDto } from './dto/create-trade.dto';
import { ApproveTradeDto } from './dto/approve-trade.dto';
import { RejectTradeDto } from './dto/reject-trade.dto';
import { TradesService } from './trades.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { ReverseTradeDto } from './dto/reverse-trade.dto';
import { TradeResponseDto } from './dto/response/trade-response.dto';
import { SettleForwardCashDto } from './dto/settle-forward-cash.dto';
import { AdminListTradesDto } from './dto/admin-list-trades.dto';
import { PaginatedResponseDto, PaginationMetaDto } from '../../common/pagination/dto/pagination-meta.dto';
import { AdminTradeDetailDto } from './dto/response/admin-trade-detail.dto';

class PaginatedTradeResponseDto extends PaginatedResponseDto<TradeResponseDto> {
  @ApiProperty({ type: [TradeResponseDto] })
  items!: TradeResponseDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta!: PaginationMetaDto;
}

@ApiTags('trades')
@ApiBearerAuth('access-token')
@Controller()
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @ApiOperation({ summary: 'Create a new trade' })
  @ApiResponse({ status: 201, description: 'Trade created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation or business rule error.' })
  @Post('trades')
  @Throttle(30, 60)
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateTradeDto, @CurrentUser() user: JwtRequestUser) {
    return this.tradesService.createForUser(user, dto);
  }

  /**
   * @deprecated Use GET /trades/my instead. The :userId parameter is ignored in favor of the authenticated user.
   */
  @Get('trades/my/:userId')
  @UseGuards(JwtAuthGuard)
  listMy(@Param('userId') _userId: string, @CurrentUser() user: JwtRequestUser) {
    return this.tradesService.findMy(user.id);
  }

  @Get('trades/my')
  @UseGuards(JwtAuthGuard)
  listMyAuthenticated(@CurrentUser() user: JwtRequestUser) {
    return this.tradesService.findMy(user.id);
  }

  @Get('admin/trades')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: PaginatedTradeResponseDto })
  listAdmin(@Query() query: AdminListTradesDto) {
    return this.tradesService.listAdmin(query);
  }

  @Get('admin/trades/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminTradeDetailDto })
  getAdminDetail(@Param('id') id: string) {
    return this.tradesService.findAdminDetail(id);
  }

  @ApiOperation({ summary: 'Approve a trade' })
  @ApiResponse({ status: 200, description: 'Trade approved.' })
  @Post('admin/trades/:id/approve')
  @Throttle(30, 60)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: TradeResponseDto })
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveTradeDto,
    @CurrentUser() admin: JwtRequestUser,
  ) {
    return this.tradesService.approve(id, dto, admin.id);
  }

  @ApiOperation({ summary: 'Reject a trade' })
  @ApiResponse({ status: 200, description: 'Trade rejected.' })
  @Post('admin/trades/:id/reject')
  @Throttle(30, 60)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: TradeResponseDto })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectTradeDto,
    @CurrentUser() admin: JwtRequestUser,
  ) {
    return this.tradesService.reject(id, dto, admin.id);
  }

  @Post('admin/trades/:id/cancel')
  @Throttle(30, 60)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: TradeResponseDto })
  cancel(
    @Param('id') id: string,
    @Body() dto: ReverseTradeDto,
    @CurrentUser() admin: JwtRequestUser,
  ) {
    return this.tradesService.cancelTrade(id, dto?.reason ?? `Cancelled by ${admin.id}`);
  }

  @Post('admin/trades/:id/reverse')
  @Throttle(30, 60)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: TradeResponseDto })
  reverse(
    @Param('id') id: string,
    @Body() dto: ReverseTradeDto,
    @CurrentUser() admin: JwtRequestUser,
  ) {
    return this.tradesService.reverseTrade(id, admin.id, dto?.reason);
  }

  @Post('admin/trades/:id/settle-cash')
  @Throttle(30, 60)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: TradeResponseDto })
  settleCash(
    @Param('id') id: string,
    @Body() dto: SettleForwardCashDto,
    @CurrentUser() admin: JwtRequestUser,
  ) {
    return this.tradesService.settleForwardTradeInCash(id, dto, admin.id);
  }
}
