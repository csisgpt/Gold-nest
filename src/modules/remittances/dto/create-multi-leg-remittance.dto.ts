import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RemittanceLegSettlementInputDto {
  @ApiProperty({
    description:
      'ID of an existing Remittance (obligation) that this leg fully or partially settles',
  })
  @IsString()
  remittanceId!: string;

  @ApiProperty({
    description:
      'Amount of this leg that is allocated to this specific source remittance, as decimal string',
  })
  @IsString()
  amount!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

export class RemittanceLegInputDto {
  @ApiProperty({ description: 'Mobile number of the receiver' })
  @IsString()
  toMobile!: string;

  @ApiProperty({ description: 'Instrument code (e.g. IRR, GOLD_750_EQ)' })
  @IsString()
  instrumentCode!: string;

  @ApiProperty({ description: 'Amount as decimal string' })
  @IsString()
  amount!: string;

  @ApiProperty({
    required: false,
    description:
      'If provided, this remittance leg is conceptually executed on behalf of this mobile (original debtor/creditor)',
  })
  @IsOptional()
  @IsString()
  onBehalfOfMobile?: string;

  @ApiProperty({
    required: false,
    description:
      'Payment channel, e.g. INTERNAL, CASH, BANK_TRANSFER, CARD, MIXED, OTHER',
    enum: ['INTERNAL', 'CASH', 'BANK_TRANSFER', 'CARD', 'MIXED', 'OTHER'],
  })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiProperty({
    required: false,
    description: 'IBAN used for this leg (if channel=BANK_TRANSFER)',
  })
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiProperty({
    required: false,
    description: 'Last 4 digits of card used (if channel=CARD)',
  })
  @IsOptional()
  @IsString()
  cardLast4?: string;

  @ApiProperty({
    required: false,
    description:
      'External payment reference (bank ref, POS trace, etc.) to help reconciliation',
  })
  @IsOptional()
  @IsString()
  externalPaymentRef?: string;

  @ApiProperty({
    required: false,
    type: [RemittanceLegSettlementInputDto],
    description:
      'Optional mapping of this leg to one or more existing Remittances that it fully/partially settles',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RemittanceLegSettlementInputDto)
  settlements?: RemittanceLegSettlementInputDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateMultiLegRemittanceDto {
  @ApiProperty({ type: [RemittanceLegInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RemittanceLegInputDto)
  legs!: RemittanceLegInputDto[];

  @ApiProperty({
    required: false,
    description: 'Optional high-level note for the group',
  })
  @IsOptional()
  @IsString()
  groupNote?: string;

  @ApiProperty({
    required: false,
    description:
      'Optional explicit kind for this group (TRANSFER, SETTLEMENT, NETTING, PASS_THROUGH, OTHER). If not provided, it will be inferred.',
    enum: ['TRANSFER', 'SETTLEMENT', 'NETTING', 'PASS_THROUGH', 'OTHER'],
  })
  @IsOptional()
  @IsString()
  kind?: string;
}
