import { Module } from '@nestjs/common';
import { ProductProviderMappingsController } from './product-provider-mappings.controller';
import { ProductProviderMappingsService } from './product-provider-mappings.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProductProviderMappingsController],
  providers: [ProductProviderMappingsService],
  exports: [ProductProviderMappingsService],
})
export class ProductProviderMappingsModule {}
