import { ApiPropertyOptional } from '@nestjs/swagger';
import { PhysicalCustodyMovementStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsISO8601 } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/dto/list-query.dto';

export class AdminListMovementsDto extends ListQueryDto<'createdAt'> {
  @ApiPropertyOptional({ enum: PhysicalCustodyMovementStatus })
  @IsOptional()
  @IsEnum(PhysicalCustodyMovementStatus)
  status?: PhysicalCustodyMovementStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional({ description: 'ISO date for start of range' })
  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'ISO date for end of range' })
  @IsOptional()
  @IsISO8601()
  toDate?: string;

  @ApiPropertyOptional({ enum: ['createdAt'] })
  @IsOptional()
  @IsString()
  sortBy: 'createdAt' = 'createdAt';

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  limit = 20;
}
