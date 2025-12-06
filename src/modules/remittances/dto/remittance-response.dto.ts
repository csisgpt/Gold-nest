import { ApiProperty } from '@nestjs/swagger';

export class RemittanceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fromUserId!: string;

  @ApiProperty()
  toUserId!: string;

  @ApiProperty()
  toMobile!: string;

  @ApiProperty()
  instrumentCode!: string;

  @ApiProperty({ description: 'Amount as string' })
  amount!: string;

  @ApiProperty({ required: false })
  note?: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({
    required: false,
    enum: ['PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED'],
  })
  status?: 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED';

  @ApiProperty({
    required: false,
    description:
      'If set, this remittance leg was executed on behalf of this user (original debtor/creditor).',
  })
  onBehalfOfUserId?: string;

  @ApiProperty({
    required: false,
    description:
      'Payment channel for this leg (INTERNAL, CASH, BANK_TRANSFER, CARD, MIXED, OTHER).',
  })
  channel?: string;

  @ApiProperty({
    required: false,
    description: 'IBAN used for this leg (if BANK_TRANSFER).',
  })
  iban?: string;

  @ApiProperty({
    required: false,
    description: 'Last 4 digits of card used (if CARD).',
  })
  cardLast4?: string;

  @ApiProperty({
    required: false,
    description: 'External payment reference such as bank reference, POS trace, etc.',
  })
  externalPaymentRef?: string;

  @ApiProperty({
    required: false,
    description: 'ID of the remittance group this leg belongs to.',
  })
  groupId?: string;

  @ApiProperty({
    required: false,
    description:
      'Kind of the remittance group (TRANSFER, SETTLEMENT, NETTING, PASS_THROUGH, OTHER).',
  })
  groupKind?: 'TRANSFER' | 'SETTLEMENT' | 'NETTING' | 'PASS_THROUGH' | 'OTHER';

  @ApiProperty({
    required: false,
    description:
      'Status of the remittance group (OPEN, PARTIAL, CLOSED, CANCELLED).',
  })
  groupStatus?: 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED';
}
