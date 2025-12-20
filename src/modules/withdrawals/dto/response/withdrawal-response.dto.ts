import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WithdrawStatus } from '@prisma/client';
import { UserMinimalDto, UserSafeDto } from '../../../../common/dto/user.dto';

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
