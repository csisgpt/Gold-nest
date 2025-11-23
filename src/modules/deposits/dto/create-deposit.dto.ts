import { IsArray, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateDepositDto {
  @IsString()
  userId!: string;

  @IsNumberString()
  amount!: string;

  @IsString()
  method!: string;

  @IsOptional()
  @IsString()
  refNo?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];
}
