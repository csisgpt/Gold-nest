import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiProperty } from '@nestjs/swagger';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DecisionDto } from './dto/decision.dto';
import { DepositsService } from './deposits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { AdminListDepositsDto } from './dto/admin-list-deposits.dto';
import { DepositResponseDto } from './dto/response/deposit-response.dto';
import { CancelRequestDto } from './dto/cancel-request.dto';
import { AdminDepositDetailDto } from './dto/response/admin-deposit-detail.dto';
import { PaginatedResponseDto, PaginationMetaDto } from '../../common/pagination/dto/pagination-meta.dto';

class PaginatedDepositResponseDto extends PaginatedResponseDto<DepositResponseDto> {
  @ApiProperty({ type: [DepositResponseDto] })
  items!: DepositResponseDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta!: PaginationMetaDto;
}

@ApiTags('deposits')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post('deposits')
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateDepositDto, @CurrentUser() user: JwtRequestUser) {
    return this.depositsService.createForUser(user, dto);
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: PaginatedDepositResponseDto })
  listAdmin(@Query() query: AdminListDepositsDto) {
    return this.depositsService.listAdmin(query);
  }


  @Get('admin/deposits/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminDepositDetailDto })
  getAdminDetail(@Param('id') id: string) {
    return this.depositsService.findAdminDetail(id);
  }

  
  @Post('admin/deposits/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: DepositResponseDto })
  approve(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() admin: JwtRequestUser) {
    return this.depositsService.approve(id, dto, admin.id);
  }

  @Post('admin/deposits/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: DepositResponseDto })
  reject(@Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() admin: JwtRequestUser) {
    return this.depositsService.reject(id, dto, admin.id);
  }

  @Post('admin/deposits/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: DepositResponseDto })
  cancel(@Param('id') id: string, @Body() dto: CancelRequestDto) {
    return this.depositsService.cancelDeposit(id, dto?.reason);
  }
}
