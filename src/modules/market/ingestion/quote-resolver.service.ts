import { Injectable, Logger } from '@nestjs/common';
import {
  MarketProduct,
  ProductProviderMapping,
  AdminPriceOverride,
  MarketProductType,
  PricingOverrideMode,
} from '@prisma/client';
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

  private isOverrideActive(override?: AdminPriceOverride | null, now = new Date()): override is AdminPriceOverride {
    if (!override) return false;
    if (!override.isActive) return false;
    if (override.revokedAt && override.revokedAt <= now) return false;
    if (override.startsAt && override.startsAt > now) return false;
    if (override.expiresAt && override.expiresAt <= now) return false;
    return true;
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

    const activeOverride = this.isOverrideActive(override, now) ? override : null;

    const applyOverride = (): ResolvedQuote | null => {
      if (!activeOverride) return null;

      const mode = activeOverride.mode as PricingOverrideMode;
      const baseBuyRaw = activeOverride.buyAbsolute != null ? new Decimal(activeOverride.buyAbsolute).toNumber() : undefined;
      const baseSellRaw = activeOverride.sellAbsolute != null ? new Decimal(activeOverride.sellAbsolute).toNumber() : undefined;

      if (mode === PricingOverrideMode.ABSOLUTE) {
        if (baseBuyRaw == null || baseSellRaw == null) return null;
        const priced = this.pricingEngine.apply(product.productType, baseBuyRaw, baseSellRaw);
        return {
          ...base,
          status: 'OK',
          asOf: now.toISOString(),
          baseBuy: baseBuyRaw,
          baseSell: baseSellRaw,
          ...priced,
          source: { type: 'OVERRIDE', overrideId: activeOverride.id },
        };
      }

      if (!chosen || !sourceProvider) {
        return null;
      }

      if (mode === PricingOverrideMode.DELTA_BPS) {
        const baseBuy = new Decimal(chosen.buy).mul(new Decimal(1).plus((activeOverride.buyDeltaBps ?? 0) / 10_000)).toNumber();
        const baseSell = new Decimal(chosen.sell)
          .mul(new Decimal(1).plus((activeOverride.sellDeltaBps ?? 0) / 10_000))
          .toNumber();
        if (baseBuy < 0 || baseSell < 0) return null;
        const status: QuoteStatus = this.isStale(chosen.asOf) ? 'STALE' : 'OK';
        const priced = this.pricingEngine.apply(product.productType, baseBuy, baseSell);
        return {
          ...base,
          status,
          asOf: chosen.asOf.toISOString(),
          baseBuy,
          baseSell,
          ...priced,
          source: { type: 'OVERRIDE', overrideId: activeOverride.id, providerKey: sourceProvider.key },
        };
      }

      if (mode === PricingOverrideMode.DELTA_AMOUNT) {
        const baseBuy = new Decimal(chosen.buy).plus(activeOverride.buyDeltaAmount ?? 0).toNumber();
        const baseSell = new Decimal(chosen.sell).plus(activeOverride.sellDeltaAmount ?? 0).toNumber();
        if (baseBuy < 0 || baseSell < 0) return null;
        const status: QuoteStatus = this.isStale(chosen.asOf) ? 'STALE' : 'OK';
        const priced = this.pricingEngine.apply(product.productType, baseBuy, baseSell);
        return {
          ...base,
          status,
          asOf: chosen.asOf.toISOString(),
          baseBuy,
          baseSell,
          ...priced,
          source: { type: 'OVERRIDE', overrideId: activeOverride.id, providerKey: sourceProvider.key },
        };
      }

      return null;
    };

    const overridden = applyOverride();
    if (overridden) return overridden;

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
