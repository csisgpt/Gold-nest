import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiProperty, ApiHeader } from '@nestjs/swagger';
import { DecisionDto } from '../deposits/dto/decision.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalsService } from './withdrawals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { WithdrawalResponseDto } from './dto/response/withdrawal-response.dto';
import { CancelRequestDto } from '../deposits/dto/cancel-request.dto';
import { AdminListWithdrawalsDto } from './dto/admin-list-withdrawals.dto';
import { AdminWithdrawalDetailDto } from './dto/response/admin-withdrawal-detail.dto';
import { PaginatedResponseDto, PaginationMetaDto } from '../../common/pagination/dto/pagination-meta.dto';
import { WithdrawAccessGuard } from './guards/withdraw-access.guard';

class PaginatedWithdrawalResponseDto extends PaginatedResponseDto<WithdrawalResponseDto> {
  @ApiProperty({ type: [WithdrawalResponseDto] })
  items!: WithdrawalResponseDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta!: PaginationMetaDto;
}

@ApiTags('withdrawals')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post('withdrawals')
  @UseGuards(JwtAuthGuard, WithdrawAccessGuard)
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Optional idempotency key for safe retries.' })
  create(
    @Body() dto: CreateWithdrawalDto,
    @CurrentUser() user: JwtRequestUser,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    const idempotencyKey = headers?.['idempotency-key'] ?? headers?.['x-idempotency-key'];
    const key = idempotencyKey || undefined;
    return this.withdrawalsService.createForUser(user, dto, key);
  }

  @Get('withdrawals/my/:userId')
  @UseGuards(JwtAuthGuard)
  listMy(@Param('userId') _userId: string, @CurrentUser() user: JwtRequestUser) {
    return this.withdrawalsService.findMy(user.id);
  }

  @Get('withdrawals/my')
  @UseGuards(JwtAuthGuard)
  listMyAuthenticated(@CurrentUser() user: JwtRequestUser) {
    return this.withdrawalsService.findMy(user.id);
  }

  @Get('admin/withdrawals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: PaginatedWithdrawalResponseDto })
  listAdmin(@Query() query: AdminListWithdrawalsDto) {
    return this.withdrawalsService.listAdmin(query);
  }

  @Get('admin/withdrawals/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminWithdrawalDetailDto })
  getAdminDetail(@Param('id') id: string) {
    return this.withdrawalsService.findAdminDetail(id);
  }

  @Post('admin/withdrawals/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: WithdrawalResponseDto })
  approve(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() admin: JwtRequestUser) {
    return this.withdrawalsService.approve(id, dto, admin.id);
  }

  @Post('admin/withdrawals/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: WithdrawalResponseDto })
  reject(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() admin: JwtRequestUser) {
    return this.withdrawalsService.reject(id, dto, admin.id);
  }

  @Post('admin/withdrawals/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: WithdrawalResponseDto })
  cancel(@Param('id') id: string, @Body() dto: CancelRequestDto) {
    return this.withdrawalsService.cancelWithdrawal(id, dto?.reason);
  }
}
