import { IsOptional, IsString } from 'class-validator';

export class UploadFileDto {
  @IsString()
  uploadedById!: string;

  @IsOptional()
  @IsString()
  label?: string;
}
