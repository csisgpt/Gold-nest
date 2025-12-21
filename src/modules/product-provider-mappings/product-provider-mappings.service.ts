import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListProductProviderMappingsDto } from './dto/list-product-provider-mappings.dto';
import { CreateProductProviderMappingDto } from './dto/create-product-provider-mapping.dto';
import { UpdateProductProviderMappingDto } from './dto/update-product-provider-mapping.dto';
import { ProviderMappingConflictException } from '../../common/exceptions/pricing.exceptions';
import { runInTx } from '../../common/db/tx.util';
import { SetProviderPriorityDto } from './dto/set-provider-priority.dto';

@Injectable()
export class ProductProviderMappingsService {
  private readonly logger = new Logger(ProductProviderMappingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  list(query: ListProductProviderMappingsDto) {
    const where: any = {};
    if (query.productId) where.productId = query.productId;
    if (query.providerId) where.providerId = query.providerId;
    return this.prisma.productProviderMapping.findMany({
      where,
      orderBy: [{ productId: 'asc' }, { priority: 'asc' }],
    });
  }

  create(dto: CreateProductProviderMappingDto) {
    this.logger.log(`Creating provider mapping product=${dto.productId} provider=${dto.providerId}`);
    return this.prisma.productProviderMapping.create({ data: dto });
  }

  update(id: string, dto: UpdateProductProviderMappingDto) {
    return this.prisma.productProviderMapping.update({ where: { id }, data: dto });
  }

  enable(id: string) {
    return this.prisma.productProviderMapping.update({ where: { id }, data: { isEnabled: true } });
  }

  disable(id: string) {
    return this.prisma.productProviderMapping.update({ where: { id }, data: { isEnabled: false } });
  }

  async replaceMappings(productId: string, body: SetProviderPriorityDto) {
    const seenProviderIds = new Set<string>();
    const seenPriorities = new Set<number>();
    for (const mapping of body.mappings) {
      if (seenProviderIds.has(mapping.providerId)) {
        throw new ProviderMappingConflictException('Duplicate providerId in payload');
      }
      if (seenPriorities.has(mapping.priority)) {
        throw new ProviderMappingConflictException('Duplicate priority in payload');
      }
      seenProviderIds.add(mapping.providerId);
      seenPriorities.add(mapping.priority);
    }

    return runInTx(this.prisma, async (tx) => {
      await tx.productProviderMapping.deleteMany({ where: { productId } });
      if (body.mappings.length === 0) return [];
      const created = await tx.productProviderMapping.createMany({
        data: body.mappings.map((m) => ({ ...m, productId })),
      });
      this.logger.log(`Replaced ${created.count} mappings for product=${productId}`);
      return tx.productProviderMapping.findMany({
        where: { productId },
        orderBy: { priority: 'asc' },
      });
    });
  }
}
