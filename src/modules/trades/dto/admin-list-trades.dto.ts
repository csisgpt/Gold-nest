import { ApiPropertyOptional } from '@nestjs/swagger';
import { TradeStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumberString, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/dto/list-query.dto';

export class AdminListTradesDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: TradeStatus })
  @IsOptional()
  @IsEnum(TradeStatus)
  status?: TradeStatus;

  @ApiPropertyOptional({ description: 'Filter by client id' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by client mobile (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional({ description: 'ISO date for start of range' })
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date for end of range' })
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({ description: 'Minimum total amount' })
  @IsOptional()
  @IsNumberString()
  amountFrom?: string;

  @ApiPropertyOptional({ description: 'Maximum total amount' })
  @IsOptional()
  @IsNumberString()
  amountTo?: string;

  @ApiPropertyOptional({ description: 'Search across id or clientNote' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ['createdAt'] })
  @IsOptional()
  @Transform(({ value }) => value ?? 'createdAt')
  sortBy: 'createdAt' = 'createdAt';
}

