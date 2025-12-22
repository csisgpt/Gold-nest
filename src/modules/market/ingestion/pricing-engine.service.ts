import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketProductType } from '@prisma/client';
import Decimal from 'decimal.js';

export interface PricingResult {
  displayBuy?: number;
  displaySell?: number;
}

@Injectable()
export class PricingEngineService {
  constructor(private readonly configService: ConfigService) {}

  private spreadBps(productType: MarketProductType) {
    const suffix = productType === 'GOLD'
      ? 'GOLD'
      : productType === 'COIN'
        ? 'COIN'
        : 'CASH';
    const buy = Number(this.configService.get(`MARKET_SPREAD_BPS_${suffix}_BUY`) ?? '0');
    const sell = Number(this.configService.get(`MARKET_SPREAD_BPS_${suffix}_SELL`) ?? '0');
    return { buy, sell };
  }

  apply(productType: MarketProductType, baseBuy?: number, baseSell?: number): PricingResult {
    if (baseBuy == null && baseSell == null) return {};
    const { buy: buyBps, sell: sellBps } = this.spreadBps(productType);
    const result: PricingResult = {};
    if (baseBuy != null) {
      const val = new Decimal(baseBuy).mul(new Decimal(1).plus(new Decimal(buyBps).div(10_000)));
      result.displayBuy = Number(val.toFixed(6));
    }
    if (baseSell != null) {
      const val = new Decimal(baseSell).mul(new Decimal(1).plus(new Decimal(sellBps).div(10_000)));
      result.displaySell = Number(val.toFixed(6));
    }
    return result;
  }
}
