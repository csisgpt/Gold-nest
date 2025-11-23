import { IsArray, IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { SettlementMethod, TradeSide } from '@prisma/client';

export class CreateTradeDto {
  @IsString()
  clientId!: string;

  @IsString()
  instrumentCode!: string;

  @IsEnum(TradeSide)
  side!: TradeSide;

  @IsNumberString()
  quantity!: string;

  @IsNumberString()
  pricePerUnit!: string;

  @IsEnum(SettlementMethod)
  settlementMethod!: SettlementMethod;

  @IsOptional()
  @IsString()
  clientNote?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];
}
