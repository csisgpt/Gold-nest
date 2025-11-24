import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateInstrumentPriceDto } from './dto/create-instrument-price.dto';
import { InstrumentsService } from './instruments.service';

@ApiTags('instruments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Get()
  listAll() {
    return this.instrumentsService.findAll();
  }

  @Get(':code')
  getByCode(@Param('code') code: string) {
    return this.instrumentsService.findByCode(code);
  }

  @Get(':code/prices/latest')
  async getLatestPrice(@Param('code') code: string) {
    const instrument = await this.instrumentsService.findByCode(code);
    const latest = await this.instrumentsService.findLatestPrice(instrument.id);
    if (!latest) {
      throw new NotFoundException('No price found for instrument');
    }
    return latest;
  }

  @Roles(UserRole.ADMIN)
  @Post(':code/prices')
  async createPrice(@Param('code') code: string, @Body() dto: CreateInstrumentPriceDto) {
    const instrument = await this.instrumentsService.findByCode(code);
    return this.instrumentsService.createPrice(instrument.id, dto);
  }
}
