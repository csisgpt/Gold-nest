import { IsOptional, IsString } from 'class-validator';

export class DecisionDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  processedById?: string;
}
