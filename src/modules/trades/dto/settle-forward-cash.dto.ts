import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

export class SettleForwardCashDto {
  @ApiProperty({
    description: 'Settlement price used for T+1/T+2 cash settlement',
    example: 3450000.0,
  })
  @IsNumber()
  settlementPrice!: number;

  @ApiProperty({
    description:
      'Net cash settlement amount (positive if client pays the house, negative if the house pays the client)',
    example: 1500000.0,
  })
  @IsNumber()
  settlementAmount!: number;

  @ApiProperty({
    required: false,
    description: 'Realized PnL for this trade (if not provided, we may derive or leave null)',
    example: 1500000.0,
  })
  @IsOptional()
  @IsNumber()
  realizedPnl?: number;
}
