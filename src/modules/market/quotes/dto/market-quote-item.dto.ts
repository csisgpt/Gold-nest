import { ApiProperty } from '@nestjs/swagger';
import { MarketProductType, PolicyMetric, TradeType } from '@prisma/client';
import { QuoteStatus } from '../../ingestion/quote-resolver.service';

export class MarketQuoteItemDto {
  @ApiProperty()
  productId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ enum: MarketProductType })
  productType!: MarketProductType;

  @ApiProperty({ enum: TradeType })
  tradeType!: TradeType;

  @ApiProperty({ enum: PolicyMetric })
  unitType!: PolicyMetric;

  @ApiProperty({ enum: ['OK', 'STALE', 'NO_PRICE'] })
  status!: QuoteStatus;

  @ApiProperty({ required: false })
  baseBuy?: number;

  @ApiProperty({ required: false })
  baseSell?: number;

  @ApiProperty({ required: false })
  displayBuy?: number;

  @ApiProperty({ required: false })
  displaySell?: number;

  @ApiProperty()
  asOf!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ required: false })
  source?: { type: 'OVERRIDE' | 'PROVIDER'; providerKey?: string; overrideId?: string };
}

export class MarketQuoteGroupDto {
  @ApiProperty()
  groupKey!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: [MarketQuoteItemDto] })
  items!: MarketQuoteItemDto[];
}

export class MarketQuotesResponseDto {
  @ApiProperty()
  asOf!: string;

  @ApiProperty({ type: [MarketQuoteGroupDto] })
  groups!: MarketQuoteGroupDto[];
}
