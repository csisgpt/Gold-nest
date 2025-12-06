import { ApiProperty } from '@nestjs/swagger';
import { RemittanceResponseDto } from './remittance-response.dto';

export class RemittanceSettlementEdgeDto {
  @ApiProperty()
  remittanceId!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  instrumentCode!: string;

  @ApiProperty({
    enum: ['PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED'],
  })
  status!: 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED';

  @ApiProperty()
  fromUserId!: string;

  @ApiProperty()
  fromMobile!: string;

  @ApiProperty()
  toUserId!: string;

  @ApiProperty()
  toMobile!: string;

  @ApiProperty({ required: false })
  note?: string;

  @ApiProperty()
  createdAt!: Date;
}

export class RemittanceDetailsResponseDto extends RemittanceResponseDto {
  @ApiProperty({
    type: [RemittanceSettlementEdgeDto],
    description:
      'Remittances that this leg settles (this remittance is the LEG, the others are SOURCE remittances).',
  })
  settles?: RemittanceSettlementEdgeDto[];

  @ApiProperty({
    type: [RemittanceSettlementEdgeDto],
    description:
      'Remittances that settle this remittance (this remittance is the SOURCE, the others are LEG remittances).',
  })
  settledBy?: RemittanceSettlementEdgeDto[];
}
