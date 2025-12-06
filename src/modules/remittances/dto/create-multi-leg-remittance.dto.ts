import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RemittanceLegInputDto {
  @ApiProperty({ description: 'Mobile number of the receiver' })
  @IsString()
  toMobile!: string;

  @ApiProperty({ description: 'Instrument code (e.g. IRR, GOLD_750_EQ)' })
  @IsString()
  instrumentCode!: string;

  @ApiProperty({ description: 'Amount as decimal string' })
  @IsString()
  amount!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateMultiLegRemittanceDto {
  @ApiProperty({ type: [RemittanceLegInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RemittanceLegInputDto)
  legs!: RemittanceLegInputDto[];

  @ApiProperty({ required: false, description: 'Optional high-level note for the group' })
  @IsOptional()
  @IsString()
  groupNote?: string;
}
