import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { PhysicalCustodyMovementType } from '@prisma/client';

export class CreatePhysicalCustodyMovementDto {
  @ApiProperty({ enum: PhysicalCustodyMovementType })
  @IsEnum(PhysicalCustodyMovementType)
  movementType!: PhysicalCustodyMovementType;

  @ApiProperty({ description: 'Weight in grams', example: 100.0 })
  @IsNumber()
  weightGram!: number;

  @ApiProperty({ description: 'Gold ayar as integer, e.g. 750 for 18K', example: 750 })
  @IsInt()
  ayar!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
