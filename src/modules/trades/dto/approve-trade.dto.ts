import { IsOptional, IsString } from 'class-validator';

export class ApproveTradeDto {
  @IsOptional()
  @IsString()
  adminNote?: string;

  @IsOptional()
  @IsString()
  approvedById?: string;
}
