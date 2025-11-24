import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { SettlementMethod, TradeSide } from '@prisma/client';

export class CreateTradeDto {
  /** @deprecated clientId is ignored; server will use current authenticated user instead. */
  @ApiProperty({
    example: 'client-123',
    description: 'Client identifier in the external system or UI.',
  })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiProperty({
    example: 'GOLD_750_EQ',
    description: 'Instrument code or symbol for the asset being traded.',
  })
  @IsString()
  instrumentCode!: string;

  @ApiProperty({
    enum: TradeSide,
    example: TradeSide.BUY,
    description: 'Direction of the trade: BUY or SELL.',
  })
  @IsEnum(TradeSide)
  side!: TradeSide;

  @ApiProperty({
    example: '10.5',
    description: 'Trade quantity as a decimal string (e.g. grams or pieces).',
  })
  @IsNumberString()
  quantity!: string;

  @ApiProperty({
    example: '3200000',
    description: 'Price per unit as a decimal string (in IRR).',
  })
  @IsNumberString()
  pricePerUnit!: string;

  @ApiProperty({
    enum: SettlementMethod,
    example: SettlementMethod.WALLET,
    description: 'Settlement method: WALLET, EXTERNAL, or CASH.',
  })
  @IsEnum(SettlementMethod)
  settlementMethod!: SettlementMethod;

  @ApiProperty({
    required: false,
    example: 'Please execute ASAP.',
    description: 'Optional note provided by the client.',
  })
  @IsOptional()
  @IsString()
  clientNote?: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['file-id-1', 'file-id-2'],
    description: 'Optional file attachment IDs for the trade (e.g. receipts).',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];
}
