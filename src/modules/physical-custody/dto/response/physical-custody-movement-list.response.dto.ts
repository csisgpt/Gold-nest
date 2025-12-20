import { ApiProperty } from '@nestjs/swagger';
import { PhysicalCustodyMovementResponseDto } from './physical-custody-movement.response.dto';

export class PhysicalCustodyMovementListResponseDto {
  @ApiProperty({ type: [PhysicalCustodyMovementResponseDto] })
  data!: PhysicalCustodyMovementResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
