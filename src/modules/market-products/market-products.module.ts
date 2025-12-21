import { Module } from '@nestjs/common';
import { MarketProductsService } from './market-products.service';
import { MarketProductsController } from './market-products.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [MarketProductsService],
  controllers: [MarketProductsController],
  exports: [MarketProductsService],
})
export class MarketProductsModule {}
