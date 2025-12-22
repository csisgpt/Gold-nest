import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteSourceType, SettlementMethod, TradeSide, TradeStatus, TradeType } from '@prisma/client';
import { UserMinimalDto, UserSafeDto } from '../../../../common/dto/user.dto';

export class AdminTradeFileDto {
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

export class AdminTradeAttachmentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fileId!: string;

  @ApiPropertyOptional({ nullable: true })
  purpose?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: () => AdminTradeFileDto })
  file!: AdminTradeFileDto;
}

export class AdminTradeInstrumentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  unit!: string;
}

export class AdminTradeOutboxDto {
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

export class AdminTradeDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: () => UserSafeDto })
  client!: UserSafeDto | null;

  @ApiProperty()
  clientId!: string;

  @ApiProperty({ type: () => AdminTradeInstrumentDto })
  instrument!: AdminTradeInstrumentDto;

  @ApiProperty({ enum: TradeSide })
  side!: TradeSide;

  @ApiProperty({ enum: TradeStatus })
  status!: TradeStatus;

  @ApiProperty({ enum: TradeType })
  type!: TradeType;

  @ApiProperty({ enum: SettlementMethod })
  settlementMethod!: SettlementMethod;

  @ApiProperty()
  quantity!: string;

  @ApiProperty()
  pricePerUnit!: string;

  @ApiPropertyOptional({ nullable: true })
  executedPrice!: string | null;

  @ApiPropertyOptional({ nullable: true })
  quoteId!: string | null;

  @ApiPropertyOptional({ enum: QuoteSourceType, nullable: true })
  priceSourceType!: QuoteSourceType | null;

  @ApiPropertyOptional({ nullable: true })
  priceSourceKey!: string | null;

  @ApiPropertyOptional({ nullable: true })
  priceSourceRefId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  priceSourceAsOf!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lockedBaseBuy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lockedBaseSell!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lockedDisplayBuy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lockedDisplaySell!: string | null;

  @ApiProperty()
  totalAmount!: string;

  @ApiPropertyOptional({ nullable: true })
  entryPrice!: string | null;

  @ApiPropertyOptional({ nullable: true })
  settlementPrice!: string | null;

  @ApiPropertyOptional({ nullable: true })
  settlementAmount!: string | null;

  @ApiPropertyOptional({ nullable: true })
  realizedPnl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  clientNote!: string | null;

  @ApiPropertyOptional({ nullable: true })
  adminNote!: string | null;

  @ApiPropertyOptional({ nullable: true })
  approvedById!: string | null;

  @ApiPropertyOptional({ type: () => UserMinimalDto, nullable: true })
  approvedBy!: UserMinimalDto | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  approvedAt!: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  rejectReason!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  reversedAt!: Date | null;

  @ApiProperty({ type: [AdminTradeAttachmentDto] })
  attachments!: AdminTradeAttachmentDto[];

  @ApiPropertyOptional({ type: () => AdminTradeOutboxDto, nullable: true })
  outbox!: AdminTradeOutboxDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

