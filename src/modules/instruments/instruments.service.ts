import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInstrumentPriceDto } from './dto/create-instrument-price.dto';

@Injectable()
export class InstrumentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.instrument.findMany({ orderBy: { code: 'asc' } });
  }

  async findByCode(code: string) {
    const instrument = await this.prisma.instrument.findUnique({ where: { code } });
    if (!instrument) {
      throw new NotFoundException(`Instrument ${code} not found`);
    }
    return instrument;
  }

  async findLatestPrice(instrumentId: string) {
    return this.prisma.instrumentPrice.findFirst({
      where: { instrumentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPrice(instrumentId: string, dto: CreateInstrumentPriceDto) {
    return this.prisma.instrumentPrice.create({
      data: {
        instrumentId,
        buyPrice: new Decimal(dto.buyPrice),
        sellPrice: new Decimal(dto.sellPrice),
        source: dto.source,
      },
    });
  }
}
