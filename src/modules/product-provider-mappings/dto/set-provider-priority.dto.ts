import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsBoolean, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class ProviderPriorityItemDto {
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

  @ApiProperty({ default: true, required: false })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean = true;
}

export class SetProviderPriorityDto {
  @ApiProperty({ type: [ProviderPriorityItemDto] })
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ProviderPriorityItemDto)
  mappings!: ProviderPriorityItemDto[];
}
