import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PriceOverridesService } from './price-overrides.service';
import { ListPriceOverridesDto } from './dto/list-price-overrides.dto';
import { CreatePriceOverrideDto } from './dto/create-price-override.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';

@ApiTags('price-overrides')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/price-overrides')
export class PriceOverridesController {
  constructor(private readonly priceOverridesService: PriceOverridesService) {}

  @Get()
  list(@Query() query: ListPriceOverridesDto) {
    return this.priceOverridesService.list(query);
  }

  @Post()
  create(@Body() dto: CreatePriceOverrideDto, @CurrentUser() admin: JwtRequestUser) {
    return this.priceOverridesService.create(dto, admin.id);
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string, @CurrentUser() admin: JwtRequestUser) {
    return this.priceOverridesService.revoke(id, admin.id);
  }
}
