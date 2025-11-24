import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateInstrumentPriceDto {
  @IsNumber()
  buyPrice!: number;

  @IsNumber()
  sellPrice!: number;

  @IsOptional()
  @IsString()
  source?: string;
}
