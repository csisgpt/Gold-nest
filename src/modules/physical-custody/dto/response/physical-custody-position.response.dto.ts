import { ApiProperty } from '@nestjs/swagger';
import { CustodyAssetType } from '@prisma/client';
import { UserMinimalDto } from '../../../../common/dto/user.dto';

export class PhysicalCustodyPositionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: () => UserMinimalDto, nullable: true })
  user!: UserMinimalDto | null;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: CustodyAssetType })
  assetType!: CustodyAssetType;

  @ApiProperty()
  weightGram!: string;

  @ApiProperty()
  ayar!: number;

  @ApiProperty()
  equivGram750!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
