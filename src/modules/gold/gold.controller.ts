import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateGoldLotDto } from './dto/create-gold-lot.dto';
import { GoldService } from './gold.service';

@ApiTags('gold')
@ApiBearerAuth('access-token')
@Controller()
export class GoldController {
  constructor(private readonly goldService: GoldService) {}

  @Post('gold/lots')
  create(@Body() dto: CreateGoldLotDto) {
    return this.goldService.createLot(dto);
  }

  @Get('gold/lots/user/:userId')
  listByUser(@Param('userId') userId: string) {
    return this.goldService.findByUser(userId);
  }
}
