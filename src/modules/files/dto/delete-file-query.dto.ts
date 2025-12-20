import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class DeleteFileQueryDto {
  @ApiPropertyOptional({ description: 'Force delete even if attachments exist (admin only).' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
