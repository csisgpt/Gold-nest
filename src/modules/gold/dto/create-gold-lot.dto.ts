import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsNumberString, IsOptional, IsString, Min } from 'class-validator';

export class CreateGoldLotDto {
  @ApiProperty({ example: 'user-1', description: 'Owner of the physical gold lot.' })
  @IsString()
  userId!: string;

  @ApiProperty({ example: '100.25', description: 'Gross weight of the lot as decimal string (grams).' })
  @IsNumberString()
  grossWeight!: string;

  @ApiProperty({ example: 750, description: 'Karat of the gold item (e.g. 750, 900).' })
  @IsInt()
  @Min(1)
  karat!: number;

  @ApiProperty({ required: false, example: 'Verified by lab', description: 'Optional note for the lot.' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['file-id-gold-photo'],
    description: 'Attachment IDs such as photos or certificates.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];
}
