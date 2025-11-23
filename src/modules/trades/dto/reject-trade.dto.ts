import { IsOptional, IsString } from 'class-validator';

export class RejectTradeDto {
  @IsOptional()
  @IsString()
  rejectReason?: string;

  @IsOptional()
  @IsString()
  rejectedById?: string;
}
