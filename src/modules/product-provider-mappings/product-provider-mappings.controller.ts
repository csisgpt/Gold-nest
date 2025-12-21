import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ProductProviderMappingsService } from './product-provider-mappings.service';
import { ListProductProviderMappingsDto } from './dto/list-product-provider-mappings.dto';
import { CreateProductProviderMappingDto } from './dto/create-product-provider-mapping.dto';
import { UpdateProductProviderMappingDto } from './dto/update-product-provider-mapping.dto';
import { SetProviderPriorityDto } from './dto/set-provider-priority.dto';

@ApiTags('product-provider-mappings')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller()
export class ProductProviderMappingsController {
  constructor(private readonly mappingsService: ProductProviderMappingsService) {}

  @Get('admin/product-provider-mappings')
  list(@Query() query: ListProductProviderMappingsDto) {
    return this.mappingsService.list(query);
  }

  @Post('admin/product-provider-mappings')
  create(@Body() dto: CreateProductProviderMappingDto) {
    return this.mappingsService.create(dto);
  }

  @Patch('admin/product-provider-mappings/:id')
  update(@Param('id') id: string, @Body() dto: UpdateProductProviderMappingDto) {
    return this.mappingsService.update(id, dto);
  }

  @Post('admin/product-provider-mappings/:id/enable')
  enable(@Param('id') id: string) {
    return this.mappingsService.enable(id);
  }

  @Post('admin/product-provider-mappings/:id/disable')
  disable(@Param('id') id: string) {
    return this.mappingsService.disable(id);
  }

  @Post('admin/market-products/:id/provider-priority')
  setPriorities(@Param('id') productId: string, @Body() dto: SetProviderPriorityDto) {
    return this.mappingsService.replaceMappings(productId, dto);
  }
}
