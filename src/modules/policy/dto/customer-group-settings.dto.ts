import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpsertCustomerGroupSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showBalances?: boolean | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showGold?: boolean | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showCoins?: boolean | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showCash?: boolean | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  tradeEnabled?: boolean | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  withdrawEnabled?: boolean | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxOpenTrades?: number | null;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  metaJson?: Record<string, any> | null;
}

export class MoveGroupUsersDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];

  @IsString()
  toGroupId!: string;
}

export class GroupUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  q?: string;
}
