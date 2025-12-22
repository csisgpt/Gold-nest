import { Injectable, Logger } from '@nestjs/common';
import { MarketProduct, ProductProviderMapping, AdminPriceOverride, MarketProductType } from '@prisma/client';
import Decimal from 'decimal.js';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { PricingEngineService } from './pricing-engine.service';
import { PriceProvider, ProviderQuote } from '../providers/price-provider.interface';

export type QuoteStatus = 'OK' | 'STALE' | 'NO_PRICE';

export interface ResolvedQuote {
  productId: string;
  code: string;
  displayName: string;
  productType: MarketProductType;
  tradeType: string;
  unitType: string;
  status: QuoteStatus;
  asOf: string;
  updatedAt: string;
  baseBuy?: number;
  baseSell?: number;
  displayBuy?: number;
  displaySell?: number;
  source?: { type: 'OVERRIDE' | 'PROVIDER'; providerKey?: string; overrideId?: string };
}

@Injectable()
export class QuoteResolverService {
  private readonly logger = new Logger(QuoteResolverService.name);
  private readonly staleAfterSec: number;

  constructor(
    private readonly providerRegistry: ProviderRegistryService,
    private readonly pricingEngine: PricingEngineService,
  ) {
    this.staleAfterSec = Number(process.env.STALE_AFTER_SEC ?? '20');
  }

  private validateProviderQuote(q: ProviderQuote | null): q is ProviderQuote {
    if (!q) return false;
    if (q.buy == null || q.sell == null) return false;
    if (q.buy < 0 || q.sell < 0) return false;
    return true;
  }

  private isStale(asOf: Date): boolean {
    const cutoff = Date.now() - this.staleAfterSec * 1000;
    return asOf.getTime() < cutoff;
  }

  async resolve(
    product: MarketProduct,
    mappings: ProductProviderMapping[],
    override?: AdminPriceOverride | null,
  ): Promise<ResolvedQuote> {
    const now = new Date();
    const base: Partial<ResolvedQuote> = {
      productId: product.id,
      code: product.code,
      displayName: product.displayName,
      productType: product.productType,
      tradeType: product.tradeType,
      unitType: product.unitType,
      updatedAt: now.toISOString(),
      status: 'NO_PRICE',
      asOf: now.toISOString(),
    };

    if (override && override.isActive && override.expiresAt > now && (!override.revokedAt || override.revokedAt > now)) {
      const baseBuy = override.buyAbsolute ? new Decimal(override.buyAbsolute).toNumber() : undefined;
      const baseSell = override.sellAbsolute ? new Decimal(override.sellAbsolute).toNumber() : undefined;
      const priced = this.pricingEngine.apply(product.productType, baseBuy, baseSell);
      return {
        ...base,
        status: 'OK',
        asOf: now.toISOString(),
        baseBuy,
        baseSell,
        ...priced,
        source: { type: 'OVERRIDE', overrideId: override.id },
      };
    }

    let chosen: ProviderQuote | null = null;
    let sourceProvider: PriceProvider | undefined;

    for (const mapping of mappings) {
      const providerKey = (mapping as any).provider?.key ?? (mapping as any).providerKey ?? mapping.providerId;
      const provider = providerKey ? this.providerRegistry.get(providerKey) : undefined;
      if (!provider) {
        this.logger.warn(`Provider missing for mapping ${mapping.id} product=${product.id}`);
        continue;
      }
      try {
        const quote = await provider.fetchOne(mapping, product);
        if (!this.validateProviderQuote(quote)) {
          continue;
        }
        chosen = quote;
        sourceProvider = provider;
        break;
      } catch (err) {
        this.logger.error(`Provider ${providerKey} failed for product ${product.id}: ${(err as Error).message}`);
      }
    }

    if (!chosen || !sourceProvider) {
      return base as ResolvedQuote;
    }

    const status: QuoteStatus = this.isStale(chosen.asOf) ? 'STALE' : 'OK';
    const priced = this.pricingEngine.apply(product.productType, chosen.buy, chosen.sell);
    return {
      ...base,
      status,
      asOf: chosen.asOf.toISOString(),
      baseBuy: chosen.buy,
      baseSell: chosen.sell,
      ...priced,
      source: { type: 'PROVIDER', providerKey: sourceProvider.key },
    };
  }
}
