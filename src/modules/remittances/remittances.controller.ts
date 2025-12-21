import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateRemittanceDto } from './dto/create-remittance.dto';
import { RemittancesService } from './remittances.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { CreateMultiLegRemittanceDto } from './dto/create-multi-leg-remittance.dto';
import { RemittanceGroupResponseDto } from './dto/remittance-group-response.dto';
import { RemittanceDetailsResponseDto } from './dto/remittance-details-response.dto';
import { OpenRemittanceSummaryDto } from './dto/open-remittance-summary.dto';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('remittances')
@ApiBearerAuth('access-token')
@Controller()
export class RemittancesController {
  constructor(private readonly remittancesService: RemittancesService) {}

  @Post('remittances')
  @UseGuards(JwtAuthGuard)
  create(
    @Body() dto: CreateRemittanceDto,
    @CurrentUser() user: JwtRequestUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.remittancesService.createForUser(user.id, dto, idempotencyKey);
  }

  @Get('remittances/my')
  @UseGuards(JwtAuthGuard)
  async listMy(@CurrentUser() user: JwtRequestUser) {
    return this.remittancesService.findByUser(user.id);
  }

  @Get('remittances/my/open')
  @UseGuards(JwtAuthGuard)
  async listMyOpenObligations(
    @CurrentUser() user: JwtRequestUser,
  ): Promise<OpenRemittanceSummaryDto[]> {
    return this.remittancesService.findOpenObligationsForUser(user.id);
  }

  @Get('remittances/:id')
  @UseGuards(JwtAuthGuard)
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: JwtRequestUser,
  ): Promise<RemittanceDetailsResponseDto> {
    return this.remittancesService.findOneWithSettlementsForUser(id, user.id);
  }

  @Post('remittances/groups')
  @UseGuards(JwtAuthGuard)
  async createGroup(
    @Body() dto: CreateMultiLegRemittanceDto,
    @CurrentUser() user: JwtRequestUser,
  ): Promise<RemittanceGroupResponseDto> {
    return this.remittancesService.createGroupForUser(user.id, dto);
  }

  @Get('remittances/groups/my')
  @UseGuards(JwtAuthGuard)
  async listMyGroups(@CurrentUser() user: JwtRequestUser): Promise<RemittanceGroupResponseDto[]> {
    return this.remittancesService.findGroupsByUser(user.id);
  }

  @Post('remittances/:id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Param('id') id: string, @CurrentUser() user: JwtRequestUser) {
    return this.remittancesService.cancelByUser(id, user.id);
  }

  @Get('admin/remittances')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listAdmin(
    @Query('status') status?: any,
    @Query('fromUserId') fromUserId?: string,
    @Query('toUserId') toUserId?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.remittancesService.adminList({
      status,
      fromUserId,
      toUserId,
      createdFrom: createdFrom ? new Date(createdFrom) : undefined,
      createdTo: createdTo ? new Date(createdTo) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('admin/remittances/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  approve(@Param('id') id: string, @CurrentUser() admin: JwtRequestUser) {
    return this.remittancesService.approve(id, admin.id);
  }

  @Post('admin/remittances/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  reject(@Param('id') id: string, @CurrentUser() admin: JwtRequestUser) {
    return this.remittancesService.reject(id, admin.id);
  }
}
