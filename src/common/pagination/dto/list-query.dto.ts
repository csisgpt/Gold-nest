import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

function toInt(value: unknown, defaultValue: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export class ListQueryDto<TSort extends string = string> {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }) => toInt(value, 1))
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Transform(({ value }) => Math.min(Math.max(toInt(value, 20), 1), 100))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: TSort;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @Transform(({ value }) => (value ? String(value).toLowerCase() : SortOrder.DESC))
  @IsEnum(SortOrder)
  @IsOptional()
  order: SortOrder = SortOrder.DESC;
}
