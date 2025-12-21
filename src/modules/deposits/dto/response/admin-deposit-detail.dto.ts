import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountTxType, DepositStatus, TxRefType } from '@prisma/client';
import { UserMinimalDto, UserSafeDto } from '../../../../common/dto/user.dto';

export class AdminDepositFileDto {
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

export class AdminDepositAttachmentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fileId!: string;

  @ApiPropertyOptional({ nullable: true })
  purpose?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: () => AdminDepositFileDto })
  file!: AdminDepositFileDto;
}

export class AdminDepositAccountDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: () => Object })
  instrument!: { id: string; code: string; name: string; unit: string };
}

export class AdminDepositAccountTxDto {
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

  @ApiPropertyOptional({ type: () => AdminDepositAccountDto, nullable: true })
  account!: AdminDepositAccountDto | null;
}

export class AdminDepositOutboxDto {
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

export class AdminDepositDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: () => UserSafeDto })
  user!: UserSafeDto | null;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  method!: string;

  @ApiProperty({ enum: DepositStatus })
  status!: DepositStatus;

  @ApiPropertyOptional({ nullable: true })
  refNo!: string | null;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  processedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  processedById!: string | null;

  @ApiPropertyOptional({ type: () => UserMinimalDto, nullable: true })
  processedBy!: UserMinimalDto | null;

  @ApiPropertyOptional({ type: () => AdminDepositAccountTxDto, nullable: true })
  accountTx!: AdminDepositAccountTxDto | null;

  @ApiProperty({ type: [AdminDepositAttachmentDto] })
  attachments!: AdminDepositAttachmentDto[];

  @ApiPropertyOptional({ type: () => AdminDepositOutboxDto, nullable: true })
  outbox!: AdminDepositOutboxDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

