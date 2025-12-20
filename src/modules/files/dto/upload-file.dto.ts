import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UploadFileDto {
  @ApiPropertyOptional({ example: 'payment receipt', description: 'Optional label or purpose for the file.' })
  @IsOptional()
  @IsString()
  label?: string;
}
