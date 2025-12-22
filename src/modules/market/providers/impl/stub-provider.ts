import { Injectable, Logger } from '@nestjs/common';
import { MarketProduct, ProductProviderMapping } from '@prisma/client';
import { PriceProvider, ProviderQuote } from '../price-provider.interface';

@Injectable()
export class StubProvider implements PriceProvider {
  key = 'STUB';
  supportsBulk = false;
  private readonly logger = new Logger(StubProvider.name);

  async fetchOne(
    mapping: ProductProviderMapping,
    product: MarketProduct,
  ): Promise<ProviderQuote | null> {
    this.logger.debug(`Stub provider invoked for product=${product.id} symbol=${mapping.providerSymbol}`);
    return null;
  }
}
