import { ApiProperty } from '@nestjs/swagger';
import { KycLevel, KycStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateUserKycDto {
  @ApiProperty({ enum: KycStatus })
  @IsEnum(KycStatus)
  status!: KycStatus;

  @ApiProperty({ enum: KycLevel })
  @IsEnum(KycLevel)
  level!: KycLevel;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
