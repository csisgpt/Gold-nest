import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DecisionDto {
  @ApiProperty({ required: false, example: 'Approved after verification', description: 'Optional note for the decision.' })
  @IsOptional()
  @IsString()
  note?: string;

  /** @deprecated Admin identifier is taken from the authenticated user context. */
  @ApiProperty({ required: false, example: 'admin-42', description: 'Admin processing identifier (deprecated).', deprecated: true })
  @IsOptional()
  @IsString()
  processedById?: string;
}
