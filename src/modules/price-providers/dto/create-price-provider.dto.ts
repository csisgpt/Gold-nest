import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class CreatePriceProviderDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Z0-9_]+$/)
  @Length(2, 64)
  key!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 128)
  displayName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean = true;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  supportsStreaming?: boolean = false;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultPollIntervalSec?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  authJson?: Record<string, any>;
}
