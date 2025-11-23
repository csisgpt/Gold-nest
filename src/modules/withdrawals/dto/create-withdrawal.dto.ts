import { IsArray, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateWithdrawalDto {
  @IsString()
  userId!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsString()
  cardNumber?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];
}
