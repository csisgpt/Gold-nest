import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductProviderMappingDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty()
  @IsString()
  providerId!: string;

  @ApiProperty()
  @IsString()
  providerSymbol!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  priority!: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean = true;

  @ApiProperty({ required: false })
  @IsOptional()
  metaJson?: Record<string, any>;
}
