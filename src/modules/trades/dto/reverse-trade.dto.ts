import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReverseTradeDto {
  @ApiProperty({ required: false, description: 'Optional reason for reversing the trade' })
  @IsOptional()
  @IsString()
  reason?: string;
}
