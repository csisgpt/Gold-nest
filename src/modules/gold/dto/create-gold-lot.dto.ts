import { IsArray, IsInt, IsNumberString, IsOptional, IsString, Min } from 'class-validator';

export class CreateGoldLotDto {
  @IsString()
  userId!: string;

  @IsNumberString()
  grossWeight!: string;

  @IsInt()
  @Min(1)
  karat!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];
}
