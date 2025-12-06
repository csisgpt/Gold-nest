import { ApiProperty } from '@nestjs/swagger';
import { RemittanceResponseDto } from './remittance-response.dto';

export class RemittanceGroupResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  createdByUserId!: string;

  @ApiProperty({ required: false })
  note?: string;

  @ApiProperty()
  status!: 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED';

  @ApiProperty({ type: [RemittanceResponseDto] })
  legs!: RemittanceResponseDto[];

  @ApiProperty()
  createdAt!: Date;
}
