import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { RequestPurpose, WithdrawalChannel } from '@prisma/client';

const RequestPurposeEnum =
  (RequestPurpose as any) ??
  ({
    DIRECT: 'DIRECT',
    P2P: 'P2P',
  } as const);

const WithdrawalChannelEnum =
  (WithdrawalChannel as any) ??
  ({
    USER_TO_USER: 'USER_TO_USER',
    USER_TO_ORG: 'USER_TO_ORG',
  } as const);

export class CreateWithdrawalDto {
  /** @deprecated userId is taken from the authenticated user. */
  @ApiProperty({ example: 'user-1', description: 'User requesting the withdrawal (deprecated).', required: false })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ example: '5000000', description: 'Withdrawal amount in IRR as a decimal string.' })
  @IsNumberString()
  amount!: string;

  @ApiProperty({ required: false, enum: RequestPurposeEnum, description: 'Purpose of the withdrawal request.' })
  @IsOptional()
  @IsEnum(RequestPurposeEnum)
  purpose?: RequestPurpose;

  @ApiProperty({ required: false, enum: WithdrawalChannelEnum, description: 'Channel for P2P withdrawal.' })
  @IsOptional()
  @IsEnum(WithdrawalChannelEnum)
  channel?: WithdrawalChannel;

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

  @ApiProperty({ required: false, example: 'dest-123', description: 'Payout destination ID (preferred for P2P).' })
  @IsOptional()
  @IsString()
  payoutDestinationId?: string;

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
