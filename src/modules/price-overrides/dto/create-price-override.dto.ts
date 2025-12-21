import { ApiProperty } from '@nestjs/swagger';
import { PricingOverrideMode } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePriceOverrideDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty({ enum: PricingOverrideMode })
  @IsEnum(PricingOverrideMode)
  mode!: PricingOverrideMode;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  buyAbsolute?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  sellAbsolute?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  buyDeltaBps?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  sellDeltaBps?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  buyDeltaAmount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  sellDeltaAmount?: number;

  @ApiProperty()
  @IsISO8601()
  expiresAt!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean = true;
}
