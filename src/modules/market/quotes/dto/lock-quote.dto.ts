import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TradeSide } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class LockQuoteRequestDto {
  @ApiProperty({ description: 'Market product identifier', example: 'mp_123' })
  @IsString()
  productId!: string;

  @ApiProperty({ enum: TradeSide })
  @IsEnum(TradeSide)
  side!: TradeSide;

  @ApiPropertyOptional({ description: 'Force creation of a new lock instead of reusing the latest one.' })
  @IsOptional()
  @IsBoolean()
  forceNew?: boolean;
}

export class LockQuoteResponseDto {
  @ApiProperty()
  quoteId!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty({ description: 'Executable price chosen by the server' })
  executablePrice!: number;

  @ApiProperty({ description: 'Locked quote payload snapshot' })
  quote!: any;
}
