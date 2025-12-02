import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateWithdrawalDto {
  /** @deprecated userId is taken from the authenticated user. */
  @ApiProperty({ example: 'user-1', description: 'User requesting the withdrawal (deprecated).', required: false })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ example: '5000000', description: 'Withdrawal amount in IRR as a decimal string.' })
  @IsNumberString()
  amount!: string;

  @ApiProperty({ required: false, example: 'Mellat', description: 'Destination bank name.' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({
    required: false,
    example: 'IR123456789012345678901234',
    description: 'Destination IBAN for the withdrawal.',
  })
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiProperty({ required: false, example: '6219861034567890', description: 'Card number for settlement if used.' })
  @IsOptional()
  @IsString()
  cardNumber?: string;

  @ApiProperty({ required: false, example: 'Urgent payout requested.', description: 'Optional note from user.' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['file-id-abc'],
    description: 'Optional file IDs attached for withdrawal verification.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];
}
