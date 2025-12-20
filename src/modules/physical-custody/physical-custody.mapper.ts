import { Prisma } from '@prisma/client';
import { toUserMinimalDto } from '../../common/mappers/user.mapper';
import { userMinimalSelect, userSafeSelect } from '../../common/prisma/selects/user.select';
import { PhysicalCustodyMovementResponseDto } from './dto/response/physical-custody-movement.response.dto';
import { PhysicalCustodyPositionResponseDto } from './dto/response/physical-custody-position.response.dto';

export const custodyMovementSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  user: { select: userSafeSelect },
  assetType: true,
  movementType: true,
  status: true,
  weightGram: true,
  ayar: true,
  equivGram750: true,
  userGoldAccountTxId: true,
  houseGoldAccountTxId: true,
  tahesabFactorCode: true,
  note: true,
} as const;

export type CustodyMovementWithUser = Prisma.PhysicalCustodyMovementGetPayload<{
  select: typeof custodyMovementSelect;
}>;

export const custodyPositionSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  user: { select: userSafeSelect },
  assetType: true,
  weightGram: true,
  ayar: true,
  equivGram750: true,
} as const;

export type CustodyPositionWithUser = Prisma.PhysicalCustodyPositionGetPayload<{
  select: typeof custodyPositionSelect;
}>;

export class PhysicalCustodyMapper {
  static toMovementDto(movement: CustodyMovementWithUser): PhysicalCustodyMovementResponseDto {
    return {
      id: movement.id,
      userId: movement.userId,
      user: toUserMinimalDto(movement.user),
      assetType: movement.assetType,
      movementType: movement.movementType,
      status: movement.status,
      weightGram: movement.weightGram.toString(),
      ayar: movement.ayar,
      equivGram750: (movement.equivGram750 as any)?.toString() ?? null,
      userGoldAccountTxId: movement.userGoldAccountTxId ?? null,
      houseGoldAccountTxId: movement.houseGoldAccountTxId ?? null,
      tahesabFactorCode: movement.tahesabFactorCode ?? null,
      note: movement.note,
      createdAt: movement.createdAt,
      updatedAt: movement.updatedAt,
    };
  }

  static toMovementDtos(movements: CustodyMovementWithUser[]): PhysicalCustodyMovementResponseDto[] {
    return movements.map((movement) => this.toMovementDto(movement));
  }

  static toPositionDto(position: CustodyPositionWithUser): PhysicalCustodyPositionResponseDto {
    return {
      id: position.id,
      userId: position.userId,
      user: toUserMinimalDto(position.user),
      assetType: position.assetType,
      weightGram: position.weightGram.toString(),
      ayar: position.ayar,
      equivGram750: (position.equivGram750 as any).toString(),
      createdAt: position.createdAt,
      updatedAt: position.updatedAt,
    };
  }

  static toPositionDtos(positions: CustodyPositionWithUser[]): PhysicalCustodyPositionResponseDto[] {
    return positions.map((position) => this.toPositionDto(position));
  }
}
