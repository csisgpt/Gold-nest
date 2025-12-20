import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UploadFileDto {
  @ApiProperty({ required: false, example: 'payment receipt', description: 'Optional label or purpose for the file.' })
  @IsOptional()
  @IsString()
  label?: string;
}
