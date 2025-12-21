import { ApiPropertyOptional } from '@nestjs/swagger';
import { DepositStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNumberString, IsOptional, IsString, IsISO8601 } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/dto/list-query.dto';

export class AdminListDepositsDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: DepositStatus })
  @IsOptional()
  @IsEnum(DepositStatus)
  status?: DepositStatus;

  @ApiPropertyOptional({ description: 'Filter by user id' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by user mobile (contains, case-insensitive)' })
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

  @ApiPropertyOptional({ description: 'Minimum amount' })
  @IsOptional()
  @IsNumberString()
  amountFrom?: string;

  @ApiPropertyOptional({ description: 'Maximum amount' })
  @IsOptional()
  @IsNumberString()
  amountTo?: string;

  @ApiPropertyOptional({ description: 'Search by refNo or id' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ['createdAt'] })
  @IsOptional()
  @Transform(({ value }) => value ?? 'createdAt')
  sortBy: 'createdAt' = 'createdAt';
}

