import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { PhysicalCustodyService } from './physical-custody.service';
import { CreatePhysicalCustodyMovementDto } from './dto/create-physical-custody-movement.dto';
import { CancelPhysicalCustodyMovementDto } from './dto/cancel-physical-custody-movement.dto';


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
  approve(@Param('id') id: string) {
    return this.service.approveMovement(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('physical-custody/movements/:id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelPhysicalCustodyMovementDto) {
    return this.service.cancelMovement(id, dto);
  }
}
