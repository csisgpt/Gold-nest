import { Injectable, NotFoundException } from '@nestjs/common';
import { Instrument, InstrumentType, Prisma, TradeType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface BuiltPolicyContext {
  productId: string;
  instrumentId: string;
  instrumentType: InstrumentType;
  tradeType: TradeType;
}

@Injectable()
export class PolicyContextBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async buildFromMarketProduct(
    productId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<BuiltPolicyContext> {
    const product = await db.marketProduct.findUnique({
      where: { id: productId },
      include: { baseInstrument: true },
    });

    if (!product) {
      throw new NotFoundException('MARKET_PRODUCT_NOT_FOUND');
    }

    return {
      productId: product.id,
      instrumentId: product.baseInstrumentId,
      instrumentType: (product.baseInstrument as Instrument).type,
      tradeType: product.tradeType,
    };
  }
}
