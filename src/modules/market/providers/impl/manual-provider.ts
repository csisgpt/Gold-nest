import { Injectable } from '@nestjs/common';
import { MarketProduct, ProductProviderMapping } from '@prisma/client';
import { PriceProvider, ProviderQuote } from '../price-provider.interface';

@Injectable()
export class ManualProvider implements PriceProvider {
  key = 'MANUAL';
  supportsBulk = false;

  async fetchOne(
    _mapping: ProductProviderMapping,
    _product: MarketProduct,
  ): Promise<ProviderQuote | null> {
    // Manual provider relies on AdminPriceOverride for deterministic control.
    return null;
  }
}
