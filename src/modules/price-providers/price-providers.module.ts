import { Module } from '@nestjs/common';
import { PriceProvidersController } from './price-providers.controller';
import { PriceProvidersService } from './price-providers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PriceProvidersService],
  controllers: [PriceProvidersController],
  exports: [PriceProvidersService],
})
export class PriceProvidersModule {}
