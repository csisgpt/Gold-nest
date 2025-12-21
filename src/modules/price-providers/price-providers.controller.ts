import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PriceProvidersService } from './price-providers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreatePriceProviderDto } from './dto/create-price-provider.dto';
import { UpdatePriceProviderDto } from './dto/update-price-provider.dto';

@ApiTags('price-providers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/price-providers')
export class PriceProvidersController {
  constructor(private readonly priceProvidersService: PriceProvidersService) {}

  @Get()
  list() {
    return this.priceProvidersService.list();
  }

  @Post()
  create(@Body() dto: CreatePriceProviderDto) {
    return this.priceProvidersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePriceProviderDto) {
    return this.priceProvidersService.update(id, dto);
  }

  @Post(':id/enable')
  enable(@Param('id') id: string) {
    return this.priceProvidersService.enable(id);
  }

  @Post(':id/disable')
  disable(@Param('id') id: string) {
    return this.priceProvidersService.disable(id);
  }
}
