import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DepositStatus } from '@prisma/client';
import { UserMinimalDto, UserSafeDto } from '../../../../common/dto/user.dto';

export class DepositResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: () => UserSafeDto, nullable: true })
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
  refNo?: string | null;

  @ApiPropertyOptional({ nullable: true })
  note?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
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
