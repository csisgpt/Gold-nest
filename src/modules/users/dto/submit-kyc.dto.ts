import { ApiPropertyOptional } from '@nestjs/swagger';
import { KycLevel } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class SubmitKycDto {
  @ApiPropertyOptional({ enum: KycLevel })
  @IsOptional()
  @IsEnum(KycLevel)
  levelRequested?: KycLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];
}
