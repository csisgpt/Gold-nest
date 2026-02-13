import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class WalletAdjustDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  instrumentCode!: string;

  @ApiProperty({ description: 'Signed numeric amount as string. Supports negative values.' })
  @IsString()
  @Matches(/^-?\d+(\.\d+)?$/)
  amount!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalRef?: string;
}
