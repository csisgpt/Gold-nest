import { Injectable } from '@nestjs/common';
import { MarketProductType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QuoteCacheService, CanonicalQuote } from '../ingestion/quote-cache.service';
import { UserSettingsService } from '../../user-settings/user-settings.service';
import { MarketQuotesResponseDto, MarketQuoteGroupDto, MarketQuoteItemDto } from './dto/market-quote-item.dto';

@Injectable()
export class MarketQuotesService {
  private readonly groupTitles: Record<string, string> = {};

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: QuoteCacheService,
    private readonly userSettingsService: UserSettingsService,
  ) {}

  isVisible(productType: MarketProductType, settings: { showGold: boolean; showCoins: boolean; showCash: boolean }) {
    if (productType === MarketProductType.GOLD && !settings.showGold) return false;
    if (productType === MarketProductType.COIN && !settings.showCoins) return false;
    if (productType === MarketProductType.CASH && !settings.showCash) return false;
    return true;
  }

  private toItem(product: any, quote: CanonicalQuote | null): MarketQuoteItemDto {
    const status = quote?.status ?? 'NO_PRICE';
    const asOf = quote?.asOf ?? new Date(0).toISOString();
    const updatedAt = quote?.updatedAt ?? new Date(0).toISOString();
    return {
      productId: product.id,
      code: product.code,
      displayName: product.displayName,
      productType: product.productType,
      tradeType: product.tradeType,
      unitType: product.unitType,
      status,
      baseBuy: quote?.baseBuy,
      baseSell: quote?.baseSell,
      displayBuy: quote?.displayBuy,
      displaySell: quote?.displaySell,
      source: quote?.source,
      asOf,
      updatedAt,
      cacheMiss: quote?.cacheMiss,
    };
  }

  async listForUser(userId: string): Promise<MarketQuotesResponseDto> {
    const settings = await this.userSettingsService.getForUser(userId);
    const products = await this.prisma.marketProduct.findMany({
      where: { isActive: true },
      orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }],
    });
    const filteredProducts = products.filter((p) => this.isVisible(p.productType, settings));
    const quotes = await this.cache.getQuotes(filteredProducts.map((p) => p.id));

    const groups = new Map<string, MarketQuoteGroupDto>();
    let latest = 0;

    filteredProducts.forEach((product, idx) => {
      const quote = quotes[idx];
      const item = this.toItem(product, quote);
      const asOfTs = Date.parse(item.asOf);
      if (asOfTs > latest) latest = asOfTs;
      const group = groups.get(product.groupKey) ?? {
        groupKey: product.groupKey,
        title: this.groupTitles[product.groupKey] ?? product.groupKey,
        items: [],
      };
      group.items.push(item);
      groups.set(product.groupKey, group);
    });

    return {
      asOf: latest ? new Date(latest).toISOString() : new Date(0).toISOString(),
      groups: Array.from(groups.values()),
    };
  }

  async getOne(userId: string, productId: string): Promise<MarketQuoteItemDto> {
    const settings = await this.userSettingsService.getForUser(userId);
    const product = await this.prisma.marketProduct.findUnique({ where: { id: productId } });
    if (!product || !product.isActive || !this.isVisible(product.productType, settings)) {
      throw new Error('Product not available');
    }
    const quote = await this.cache.getQuote(productId);
    const fallback: CanonicalQuote = {
      productId,
      code: product.code,
      displayName: product.displayName,
      productType: product.productType,
      tradeType: product.tradeType,
      unitType: product.unitType,
      status: 'NO_PRICE',
      asOf: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cacheMiss: true,
    };
    return this.toItem(product, quote ?? fallback);
  }
}
