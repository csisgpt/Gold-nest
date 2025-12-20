import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustodyAssetType, PhysicalCustodyMovementStatus, PhysicalCustodyMovementType } from '@prisma/client';
import { UserMinimalDto } from '../../../../common/dto/user.dto';

export class PhysicalCustodyMovementResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: () => UserMinimalDto, nullable: true })
  user!: UserMinimalDto | null;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: CustodyAssetType })
  assetType!: CustodyAssetType;

  @ApiProperty({ enum: PhysicalCustodyMovementType })
  movementType!: PhysicalCustodyMovementType;

  @ApiProperty({ enum: PhysicalCustodyMovementStatus })
  status!: PhysicalCustodyMovementStatus;

  @ApiProperty()
  weightGram!: string;

  @ApiProperty()
  ayar!: number;

  @ApiPropertyOptional({ nullable: true })
  equivGram750?: string | null;

  @ApiPropertyOptional({ nullable: true })
  userGoldAccountTxId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  houseGoldAccountTxId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  tahesabFactorCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  note?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
