import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentDestinationType, RequestPurpose, WithdrawStatus } from '@prisma/client';
import { UserMinimalDto, UserSafeDto } from '../../../../common/dto/user.dto';

const PaymentDestinationTypeEnum =
  (PaymentDestinationType as any) ??
  ({
    IBAN: 'IBAN',
    CARD: 'CARD',
    ACCOUNT: 'ACCOUNT',
  } as const);
const RequestPurposeEnum =
  (RequestPurpose as any) ??
  ({
    DIRECT: 'DIRECT',
    P2P: 'P2P',
  } as const);

export class WithdrawalDestinationDto {
  @ApiProperty({ enum: PaymentDestinationTypeEnum })
  type!: PaymentDestinationType;

  @ApiProperty()
  maskedValue!: string;

  @ApiPropertyOptional({ nullable: true })
  bankName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  ownerNameMasked?: string | null;
}

export class WithdrawalResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: () => UserSafeDto, nullable: true })
  user!: UserSafeDto | null;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ enum: WithdrawStatus })
  status!: WithdrawStatus;

  @ApiProperty({ enum: RequestPurposeEnum })
  purpose!: RequestPurpose;

  @ApiPropertyOptional({ type: () => WithdrawalDestinationDto, nullable: true })
  destination?: WithdrawalDestinationDto | null;

  @ApiPropertyOptional({ nullable: true })
  bankName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  iban?: string | null;

  @ApiPropertyOptional({ nullable: true })
  cardNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  note?: string | null;

  @ApiPropertyOptional({ nullable: true })
  processedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  processedById?: string | null;

  @ApiPropertyOptional({ type: () => UserMinimalDto, nullable: true })
  processedBy?: UserMinimalDto | null;

  @ApiPropertyOptional({ nullable: true })
  accountTxId?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
