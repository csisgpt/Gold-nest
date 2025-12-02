import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateRemittanceDto {
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
