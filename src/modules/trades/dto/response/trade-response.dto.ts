import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SettlementMethod, TradeSide, TradeStatus, TradeType } from '@prisma/client';
import { UserMinimalDto, UserSafeDto } from '../../../../common/dto/user.dto';

export class TradeInstrumentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  unit!: string;
}

export class TradeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: () => UserSafeDto, nullable: true })
  client!: UserSafeDto | null;

  @ApiProperty()
  clientId!: string;

  @ApiProperty({ type: () => TradeInstrumentDto })
  instrument!: TradeInstrumentDto;

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

  @ApiProperty()
  totalAmount!: string;

  @ApiPropertyOptional({ nullable: true })
  entryPrice?: string | null;

  @ApiPropertyOptional({ nullable: true })
  settlementPrice?: string | null;

  @ApiPropertyOptional({ nullable: true })
  settlementAmount?: string | null;

  @ApiPropertyOptional({ nullable: true })
  realizedPnl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  clientNote?: string | null;

  @ApiPropertyOptional({ nullable: true })
  adminNote?: string | null;

  @ApiPropertyOptional({ type: () => UserMinimalDto, nullable: true })
  approvedBy?: UserMinimalDto | null;

  @ApiPropertyOptional({ nullable: true })
  approvedById?: string | null;

  @ApiPropertyOptional({ nullable: true })
  approvedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  rejectedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  rejectReason?: string | null;

  @ApiPropertyOptional({ nullable: true })
  reversedAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
