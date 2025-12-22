import { MarketProduct, ProductProviderMapping } from '@prisma/client';

export interface ProviderQuote {
  productId: string;
  providerKey: string;
  providerSymbol: string;
  asOf: Date;
  buy: number;
  sell: number;
  raw?: any;
}

export interface PriceProvider {
  key: string;
  supportsBulk: boolean;
  fetchOne(mapping: ProductProviderMapping, product: MarketProduct): Promise<ProviderQuote | null>;
  fetchMany?(
    mappings: ProductProviderMapping[],
    productsById: Map<string, MarketProduct>,
  ): Promise<ProviderQuote[]>;
}
