import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountTxType, TxRefType, WithdrawStatus } from '@prisma/client';
import { UserMinimalDto, UserSafeDto } from '../../../../common/dto/user.dto';

export class AdminWithdrawalFileDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiPropertyOptional({ nullable: true })
  label?: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminWithdrawalAttachmentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fileId!: string;

  @ApiPropertyOptional({ nullable: true })
  purpose?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: () => AdminWithdrawalFileDto })
  file!: AdminWithdrawalFileDto;
}

export class AdminWithdrawalAccountDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: () => Object })
  instrument!: { id: string; code: string; name: string; unit: string };
}

export class AdminWithdrawalAccountTxDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  accountId!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ enum: AccountTxType })
  type!: AccountTxType;

  @ApiProperty({ enum: TxRefType })
  refType!: TxRefType;

  @ApiPropertyOptional({ nullable: true })
  refId!: string | null;

  @ApiProperty()
  delta!: string;

  @ApiPropertyOptional({ type: () => AdminWithdrawalAccountDto, nullable: true })
  account!: AdminWithdrawalAccountDto | null;
}

export class AdminWithdrawalOutboxDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  lastError!: string | null;

  @ApiPropertyOptional({ nullable: true })
  correlationId!: string | null;

  @ApiProperty()
  method!: string;

  @ApiProperty()
  retryCount!: number;

  @ApiPropertyOptional({ nullable: true })
  tahesabFactorCode!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class AdminWithdrawalDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: () => UserSafeDto })
  user!: UserSafeDto | null;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ enum: WithdrawStatus })
  status!: WithdrawStatus;

  @ApiPropertyOptional({ nullable: true })
  bankName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  iban!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cardNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  processedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  processedById!: string | null;

  @ApiPropertyOptional({ type: () => UserMinimalDto, nullable: true })
  processedBy!: UserMinimalDto | null;

  @ApiPropertyOptional({ type: () => AdminWithdrawalAccountTxDto, nullable: true })
  accountTx!: AdminWithdrawalAccountTxDto | null;

  @ApiProperty({ type: [AdminWithdrawalAttachmentDto] })
  attachments!: AdminWithdrawalAttachmentDto[];

  @ApiPropertyOptional({ type: () => AdminWithdrawalOutboxDto, nullable: true })
  outbox!: AdminWithdrawalOutboxDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

