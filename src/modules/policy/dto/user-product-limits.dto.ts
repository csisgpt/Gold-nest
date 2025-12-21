import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested, IsNumber, IsPositive } from 'class-validator';
import { MarketProductType, PolicyMetric, TradeType } from '@prisma/client';

export class LimitCellChangeDto {
  @IsIn(['SET', 'CLEAR'])
  mode!: 'SET' | 'CLEAR';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  value?: number;
}

export class ProductLimitChangeDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LimitCellChangeDto)
  buyDaily?: LimitCellChangeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LimitCellChangeDto)
  buyMonthly?: LimitCellChangeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LimitCellChangeDto)
  sellDaily?: LimitCellChangeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LimitCellChangeDto)
  sellMonthly?: LimitCellChangeDto;
}

export class ApplyProductLimitsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductLimitChangeDto)
  changes!: ProductLimitChangeDto[];
}

export class ProductLimitsQueryDto {
  @IsOptional()
  @IsString()
  groupKey?: string;

  @IsOptional()
  includeInactiveProducts?: boolean;
}

export interface ProductLimitCell {
  effectiveValue: number | null;
  source: string;
  selectedRuleId: string | null;
  selectorUsed: string | null;
  updatedAt?: Date;
}

export interface ProductLimitRow {
  productId: string;
  code: string;
  displayName: string;
  groupKey: string;
  sortOrder: number;
  isActive: boolean;
  unitType: PolicyMetric;
  tradeType: TradeType;
  productType: MarketProductType;
  limits: {
    buyDaily: ProductLimitCell;
    buyMonthly: ProductLimitCell;
    sellDaily: ProductLimitCell;
    sellMonthly: ProductLimitCell;
  };
}
