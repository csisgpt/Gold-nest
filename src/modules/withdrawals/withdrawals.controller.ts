import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole, WithdrawStatus } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
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

@ApiTags('withdrawals')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post('withdrawals')
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateWithdrawalDto, @CurrentUser() user: JwtRequestUser) {
    return this.withdrawalsService.createForUser(user, dto);
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
  @ApiOkResponse({ type: [WithdrawalResponseDto] })
  listAdmin(@Query('status') status?: WithdrawStatus) {
    return this.withdrawalsService.findByStatus(status);
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
