import { ApiProperty } from '@nestjs/swagger';

export class OpenRemittanceSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  instrumentCode!: string;

  @ApiProperty()
  originalAmount!: string;

  @ApiProperty()
  settledAmount!: string;

  @ApiProperty()
  remainingAmount!: string;

  @ApiProperty({
    enum: ['PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED'],
  })
  status!: 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED';

  @ApiProperty({
    enum: ['INCOMING', 'OUTGOING', 'ON_BEHALF'],
    description:
      'Direction from the perspective of the current user: INCOMING = user should receive; OUTGOING = user should pay; ON_BEHALF = obligation on behalf of someone else.',
  })
  direction!: 'INCOMING' | 'OUTGOING' | 'ON_BEHALF';

  @ApiProperty()
  counterpartyUserId!: string;

  @ApiProperty()
  counterpartyMobile!: string;

  @ApiProperty({
    required: false,
    description: 'If ON_BEHALF, this is the user on whose behalf this obligation exists.',
  })
  onBehalfOfUserId?: string;

  @ApiProperty({ required: false })
  note?: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({
    required: false,
    description: 'ID of the remittance group (if any).',
  })
  groupId?: string;

  @ApiProperty({
    required: false,
    description:
      'Kind of the remittance group (TRANSFER, SETTLEMENT, NETTING, PASS_THROUGH, OTHER).',
  })
  groupKind?: 'TRANSFER' | 'SETTLEMENT' | 'NETTING' | 'PASS_THROUGH' | 'OTHER';
}
