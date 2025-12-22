import { Module } from '@nestjs/common';
import { MarketProductsService } from './market-products.service';
import { MarketProductsController } from './market-products.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UserSettingsModule } from '../user-settings/user-settings.module';

@Module({
  imports: [PrismaModule, UserSettingsModule],
  providers: [MarketProductsService],
  controllers: [MarketProductsController],
  exports: [MarketProductsService],
})
export class MarketProductsModule {}
