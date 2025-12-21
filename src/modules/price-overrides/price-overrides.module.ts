import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PriceOverridesService } from './price-overrides.service';
import { PriceOverridesController } from './price-overrides.controller';

@Module({
  imports: [PrismaModule],
  providers: [PriceOverridesService],
  controllers: [PriceOverridesController],
  exports: [PriceOverridesService],
})
export class PriceOverridesModule {}
