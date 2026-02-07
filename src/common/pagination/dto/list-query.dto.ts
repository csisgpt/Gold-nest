import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { parseNumber } from '../query-parsers';

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListQueryDto<TSort extends string = string> {
  @ApiPropertyOptional({ minimum: 1 })
  @Transform(({ value }) => parseNumber(value, 'page'))
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @Transform(({ value }) => parseNumber(value, 'limit'))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ deprecated: true, description: 'Deprecated offset pagination (use page instead).' })
  @Transform(({ value }) => parseNumber(value, 'offset'))
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ description: 'Sort expression, e.g. createdAt:desc or -createdAt.' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ deprecated: true, description: 'Deprecated alias for sort.' })
  @IsOptional()
  @IsString()
  sortBy?: TSort;

  @ApiPropertyOptional({ deprecated: true, description: 'Deprecated alias for sort.' })
  @IsOptional()
  @IsString()
  orderBy?: string;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC, deprecated: true })
  @Transform(({ value }) => (value ? String(value).toLowerCase() : undefined))
  @IsEnum(SortOrder)
  @IsOptional()
  order?: SortOrder;

  @ApiPropertyOptional({ deprecated: true, description: 'Deprecated alias for order.' })
  @IsOptional()
  @IsString()
  direction?: string;

  @ApiPropertyOptional({ deprecated: true, description: 'Deprecated alias for order.' })
  @IsOptional()
  @IsString()
  dir?: string;
}
