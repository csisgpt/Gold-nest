import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { PhysicalCustodyService } from './physical-custody.service';
import { CreatePhysicalCustodyMovementDto } from './dto/create-physical-custody-movement.dto';
import { CancelPhysicalCustodyMovementDto } from './dto/cancel-physical-custody-movement.dto';
import { AdminListMovementsDto } from './dto/admin-list-movements.dto';
import { AdminListPositionsDto } from './dto/admin-list-positions.dto';
import { PhysicalCustodyMovementResponseDto } from './dto/response/physical-custody-movement.response.dto';
import { PhysicalCustodyPositionResponseDto } from './dto/response/physical-custody-position.response.dto';
import { PhysicalCustodyMovementListResponseDto } from './dto/response/physical-custody-movement-list.response.dto';


@ApiTags('physical-custody')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()

export class PhysicalCustodyController {
  constructor(private readonly service: PhysicalCustodyService) {}

  @Post('physical-custody/movements')
  @UseGuards(JwtAuthGuard)
  request(@CurrentUser() user: JwtRequestUser, @Body() dto: CreatePhysicalCustodyMovementDto) {
    return this.service.requestMovement(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('physical-custody/movements/:id/approve')
  @ApiOkResponse({ type: PhysicalCustodyMovementResponseDto })
  approve(@Param('id') id: string) {
    return this.service.approveMovement(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('physical-custody/movements/:id/cancel')
  @ApiOkResponse({ type: PhysicalCustodyMovementResponseDto })
  cancel(@Param('id') id: string, @Body() dto: CancelPhysicalCustodyMovementDto) {
    return this.service.cancelMovement(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/physical-custody/movements')
  @ApiOkResponse({ type: PhysicalCustodyMovementListResponseDto })
  listAdminMovements(@Query() query: AdminListMovementsDto) {
    return this.service.adminListMovements(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/physical-custody/movements/:id')
  @ApiOkResponse({ type: PhysicalCustodyMovementResponseDto })
  getAdminMovement(@Param('id') id: string) {
    return this.service.adminGetMovementById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/physical-custody/positions')
  @ApiOkResponse({ type: [PhysicalCustodyPositionResponseDto] })
  listAdminPositions(@Query() query: AdminListPositionsDto) {
    return this.service.adminListPositions(query);
  }
}
