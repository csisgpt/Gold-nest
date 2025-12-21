import { ApiProperty } from '@nestjs/swagger';
import { PolicyMetric, TradeType, MarketProductType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, Matches, IsInt, Min } from 'class-validator';

export class CreateMarketProductDto {
  @ApiProperty()
  @IsString()
  @Length(2, 64)
  @Matches(/^[A-Z0-9_]+$/)
  code!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 128)
  displayName!: string;

  @ApiProperty({ enum: MarketProductType })
  @IsEnum(MarketProductType)
  productType!: MarketProductType;

  @ApiProperty({ enum: TradeType })
  @IsEnum(TradeType)
  tradeType!: TradeType;

  @ApiProperty()
  @IsString()
  baseInstrumentId!: string;

  @ApiProperty({ enum: PolicyMetric })
  @IsEnum(PolicyMetric)
  unitType!: PolicyMetric;

  @ApiProperty()
  @IsString()
  @Length(1, 64)
  groupKey!: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number = 0;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiProperty({ required: false })
  @IsOptional()
  metaJson?: Record<string, any>;
}
