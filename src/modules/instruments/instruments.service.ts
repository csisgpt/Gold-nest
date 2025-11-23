import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InstrumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: string) {
    const instrument = await this.prisma.instrument.findUnique({ where: { code } });
    if (!instrument) {
      throw new NotFoundException(`Instrument ${code} not found`);
    }
    return instrument;
  }
}
