import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { MarketProductsService } from './market-products.service';
import { ListMarketProductsDto } from './dto/list-market-products.dto';
import { CreateMarketProductDto } from './dto/create-market-product.dto';
import { UpdateMarketProductDto } from './dto/update-market-product.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { EffectiveSettingsService } from '../user-settings/effective-settings.service';

@ApiTags('market-products')
@Controller()
export class MarketProductsController {
  constructor(
    private readonly marketProductsService: MarketProductsService,
    private readonly effectiveSettingsService: EffectiveSettingsService,
  ) {}

  @Get('market-products')
  listActive() {
    return this.marketProductsService.listActive();
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('market-products/me')
  async listForUser(@CurrentUser() user: JwtRequestUser) {
    const settings = await this.effectiveSettingsService.getEffective(user.id);
    return this.marketProductsService.listActiveForUser(settings);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/market-products')
  listAdmin(@Query() query: ListMarketProductsDto) {
    return this.marketProductsService.listAdmin(query);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/market-products')
  create(@Body() dto: CreateMarketProductDto) {
    return this.marketProductsService.create(dto);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/market-products/:id')
  update(@Param('id') id: string, @Body() dto: UpdateMarketProductDto) {
    return this.marketProductsService.update(id, dto);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/market-products/:id/activate')
  activate(@Param('id') id: string) {
    return this.marketProductsService.activate(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/market-products/:id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.marketProductsService.deactivate(id);
  }
}
