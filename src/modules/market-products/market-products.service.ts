import { Injectable, Logger } from '@nestjs/common';
import { MarketProductType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListMarketProductsDto } from './dto/list-market-products.dto';
import { CreateMarketProductDto } from './dto/create-market-product.dto';
import { UpdateMarketProductDto } from './dto/update-market-product.dto';
import { EffectiveUserSettings } from '../user-settings/user-settings.types';

@Injectable()
export class MarketProductsService {
  private readonly logger = new Logger(MarketProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  listAdmin(query: ListMarketProductsDto) {
    const where: any = {};
    if (typeof query.isActive === 'string') {
      where.isActive = query.isActive === 'true';
    }
    if (query.groupKey) {
      where.groupKey = query.groupKey;
    }
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { displayName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.marketProduct.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  listActive() {
    return this.prisma.marketProduct.findMany({
      where: { isActive: true },
      orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  listActiveForUser(settings: EffectiveUserSettings) {
    const hiddenTypes: MarketProductType[] = [];
    if (!settings.showGold) hiddenTypes.push(MarketProductType.GOLD);
    if (!settings.showCoins) hiddenTypes.push(MarketProductType.COIN);
    if (!settings.showCash) hiddenTypes.push(MarketProductType.CASH);

    const where = {
      isActive: true,
      productType: hiddenTypes.length ? { notIn: hiddenTypes } : undefined,
    } as const;

    return this.prisma.marketProduct.findMany({
      where,
      orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  create(dto: CreateMarketProductDto) {
    this.logger.log(`Creating market product ${dto.code}`);
    return this.prisma.marketProduct.create({ data: dto });
  }

  update(id: string, dto: UpdateMarketProductDto) {
    this.logger.log(`Updating market product ${id}`);
    return this.prisma.marketProduct.update({ where: { id }, data: dto });
  }

  activate(id: string) {
    this.logger.log(`Activating market product ${id}`);
    return this.prisma.marketProduct.update({ where: { id }, data: { isActive: true } });
  }

  deactivate(id: string) {
    this.logger.log(`Deactivating market product ${id}`);
    return this.prisma.marketProduct.update({ where: { id }, data: { isActive: false } });
  }
}
