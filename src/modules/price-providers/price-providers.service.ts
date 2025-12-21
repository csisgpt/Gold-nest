import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePriceProviderDto } from './dto/create-price-provider.dto';
import { UpdatePriceProviderDto } from './dto/update-price-provider.dto';

@Injectable()
export class PriceProvidersService {
  private readonly logger = new Logger(PriceProvidersService.name);

  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.priceProvider.findMany({ orderBy: { key: 'asc' } });
  }

  create(dto: CreatePriceProviderDto) {
    this.logger.log(`Creating price provider ${dto.key}`);
    return this.prisma.priceProvider.create({ data: dto });
  }

  update(id: string, dto: UpdatePriceProviderDto) {
    this.logger.log(`Updating price provider ${id}`);
    return this.prisma.priceProvider.update({ where: { id }, data: dto });
  }

  enable(id: string) {
    return this.prisma.priceProvider.update({ where: { id }, data: { isEnabled: true } });
  }

  disable(id: string) {
    return this.prisma.priceProvider.update({ where: { id }, data: { isEnabled: false } });
  }
}
