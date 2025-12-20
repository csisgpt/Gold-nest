import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/dto/list-query.dto';

export class ListFilesQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'Filter by label (case-insensitive contains match).' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ description: 'Exact MIME type filter (e.g., image/jpeg).' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  @IsOptional()
  @IsDate()
  createdFrom?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  @IsOptional()
  @IsDate()
  createdTo?: Date;
}

export class AdminListFilesQueryDto extends ListFilesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by uploader user ID.' })
  @IsOptional()
  @IsString()
  uploadedById?: string;

  @ApiPropertyOptional({ description: 'Filter by storage key prefix.' })
  @IsOptional()
  @IsString()
  storageKeyPrefix?: string;
}
