import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class AccountStatementFiltersDto {
  @ApiProperty({ required: false, type: String })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiProperty({ required: false, type: String })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiProperty({ required: false, description: 'Instrument code (e.g. IRR, GOLD_750_EQ)' })
  @IsOptional()
  @IsString()
  instrumentCode?: string;
}
