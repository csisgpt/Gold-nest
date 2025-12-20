import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountTxType, CustodyAssetType, PhysicalCustodyMovementStatus, PhysicalCustodyMovementType, Prisma, TxRefType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePhysicalCustodyMovementDto } from './dto/create-physical-custody-movement.dto';
import { CancelPhysicalCustodyMovementDto } from './dto/cancel-physical-custody-movement.dto';
import { TahesabOutboxService } from '../tahesab/tahesab-outbox.service';
import { TahesabIntegrationConfigService } from '../tahesab/tahesab-integration.config';
import { SabteKolOrMovaghat, VoroodOrKhorooj } from '../tahesab/tahesab.methods';
import { DoNewSanadGoldRequestDto } from '../tahesab/dto/sanad.dto';
import { AccountsService } from '../accounts/accounts.service';
import { GOLD_750_INSTRUMENT_CODE, HOUSE_USER_ID } from '../accounts/constants';
import { PhysicalCustodyMovementResponseDto } from './dto/response/physical-custody-movement.response.dto';
import {
  custodyMovementSelect,
  CustodyMovementWithUser,
  custodyPositionSelect,
  CustodyPositionWithUser,
  PhysicalCustodyMapper,
} from './physical-custody.mapper';
import { AdminListMovementsDto } from './dto/admin-list-movements.dto';
import { AdminListPositionsDto } from './dto/admin-list-positions.dto';

const ACCOUNT_TX_TYPE_CUSTODY = 'CUSTODY' as unknown as AccountTxType;
const TX_REF_PHYSICAL_CUSTODY_MOVEMENT = 'PHYSICAL_CUSTODY_MOVEMENT' as unknown as TxRefType;

@Injectable()
export class PhysicalCustodyService {
  private readonly logger = new Logger(PhysicalCustodyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tahesabOutbox: TahesabOutboxService,
    private readonly tahesabIntegration: TahesabIntegrationConfigService,
    private readonly accountsService: AccountsService,
  ) {}

  private toEquivGram750(weightGram: Decimal | string | number, ayar: number): Decimal {
    const weight = new Decimal(weightGram ?? 0);
    const equiv = weight.mul(ayar).div(750);
    return new Decimal(equiv.toFixed(6));
  }

  private getPositionBalance(position: {
    equivGram750?: Decimal.Value | null;
    weightGram: Decimal.Value;
    ayar: number;
  }): Decimal {
    if (position.equivGram750 !== null && position.equivGram750 !== undefined) {
      return new Decimal(position.equivGram750 as Decimal.Value);
    }
    return this.toEquivGram750(position.weightGram, position.ayar);
  }

  async requestMovement(
    userId: string,
    dto: CreatePhysicalCustodyMovementDto,
  ): Promise<CustodyMovementWithUser> {
    if (!userId) {
      throw new BadRequestException('Authenticated user is required for custody requests');
    }

    const movement = await this.prisma.physicalCustodyMovement.create({
      data: {
        userId,
        assetType: CustodyAssetType.GOLD,
        movementType: dto.movementType,
        status: PhysicalCustodyMovementStatus.PENDING,
        weightGram: new Decimal(dto.weightGram),
        ayar: dto.ayar,
        note: dto.note,
      },
      select: custodyMovementSelect,
    });

    return movement as CustodyMovementWithUser;
  }

  async approveMovement(id: string): Promise<PhysicalCustodyMovementResponseDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "PhysicalCustodyMovement" WHERE id = ${id} FOR UPDATE`;

      const movement = await tx.physicalCustodyMovement.findUnique({
        where: { id },
        select: custodyMovementSelect,
      });
      if (!movement) throw new NotFoundException('Movement not found');
      if (movement.status !== PhysicalCustodyMovementStatus.PENDING) {
        return movement;
      }

      const position = (await tx.physicalCustodyPosition.upsert({
        where: { userId_assetType: { userId: movement.userId, assetType: movement.assetType } },
        update: {},
        create: {
          userId: movement.userId,
          assetType: movement.assetType,
          weightGram: new Decimal(0),
          ayar: 750,
          equivGram750: new Decimal(0),
        } as any,
      })) as any;

      const deltaEquiv = this.toEquivGram750(movement.weightGram, movement.ayar);
      const currentBalance = this.getPositionBalance(position);

      if (movement.movementType === PhysicalCustodyMovementType.WITHDRAWAL && currentBalance.lt(deltaEquiv)) {
        throw new BadRequestException('Insufficient custody balance');
      }

      const newBalance =
        movement.movementType === PhysicalCustodyMovementType.DEPOSIT
          ? currentBalance.plus(deltaEquiv)
          : currentBalance.minus(deltaEquiv);

      await tx.physicalCustodyPosition.update({
        where: { id: position.id },
        data: {
          equivGram750: newBalance,
          weightGram: new Decimal(newBalance.toFixed(4)),
          ayar: 750,
        } as any,
      });

      const userGoldAccount = await this.accountsService.getOrCreateAccount(
        movement.userId,
        GOLD_750_INSTRUMENT_CODE,
        tx,
      );
      const houseGoldAccount = await this.accountsService.getOrCreateAccount(
        HOUSE_USER_ID,
        GOLD_750_INSTRUMENT_CODE,
        tx,
      );

      const walletDelta =
        movement.movementType === PhysicalCustodyMovementType.DEPOSIT ? deltaEquiv : deltaEquiv.negated();

      const { txRecord: userTx } = await this.accountsService.applyTransaction(
        tx,
        userGoldAccount,
        walletDelta,
        ACCOUNT_TX_TYPE_CUSTODY,
        TX_REF_PHYSICAL_CUSTODY_MOVEMENT,
        movement.id,
      );

      const { txRecord: houseTx } = await this.accountsService.applyTransaction(
        tx,
        houseGoldAccount,
        walletDelta,
        ACCOUNT_TX_TYPE_CUSTODY,
        TX_REF_PHYSICAL_CUSTODY_MOVEMENT,
        movement.id,
      );

      return tx.physicalCustodyMovement.update({
        where: { id: movement.id },
        data: {
          status: PhysicalCustodyMovementStatus.APPROVED,
          equivGram750: deltaEquiv,
          userGoldAccountTxId: userTx.id,
          houseGoldAccountTxId: houseTx.id,
        } as any,
        select: custodyMovementSelect,
      });
    });

    await this.enqueueTahesabForPhysicalCustodyMovement(updated as CustodyMovementWithUser);
    return PhysicalCustodyMapper.toMovementDto(updated as CustodyMovementWithUser);
  }

  async cancelMovement(id: string, dto?: CancelPhysicalCustodyMovementDto): Promise<PhysicalCustodyMovementResponseDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "PhysicalCustodyMovement" WHERE id = ${id} FOR UPDATE`;

      const movement = await tx.physicalCustodyMovement.findUnique({ where: { id }, select: custodyMovementSelect });
      if (!movement) throw new NotFoundException('Movement not found');

      if (movement.status === PhysicalCustodyMovementStatus.CANCELLED) {
        return movement;
      }

      if (movement.status === PhysicalCustodyMovementStatus.PENDING) {
        return tx.physicalCustodyMovement.update({
          where: { id: movement.id },
          data: { status: PhysicalCustodyMovementStatus.CANCELLED, note: dto?.reason ?? movement.note },
          select: custodyMovementSelect,
        });
      }

      if (movement.status !== PhysicalCustodyMovementStatus.APPROVED) {
        return movement;
      }

      const position = (await tx.physicalCustodyPosition.findUnique({
        where: { userId_assetType: { userId: movement.userId, assetType: movement.assetType } },
      })) as any;
      if (!position) {
        throw new BadRequestException('No custody position to reverse');
      }

      const deltaEquiv = movement.equivGram750
        ? new Decimal(movement.equivGram750)
        : this.toEquivGram750(movement.weightGram, movement.ayar);
      const currentBalance = this.getPositionBalance(position);

      const newBalance =
        movement.movementType === PhysicalCustodyMovementType.DEPOSIT
          ? currentBalance.minus(deltaEquiv)
          : currentBalance.plus(deltaEquiv);

      if (newBalance.lt(0)) {
        throw new BadRequestException('Reversal would make custody negative');
      }

      await tx.physicalCustodyPosition.update({
        where: { id: position.id },
        data: {
          equivGram750: newBalance,
          weightGram: new Decimal(newBalance.toFixed(4)),
          ayar: 750,
        } as any,
      });

      const reverseForMovementType = (value: Decimal) =>
        movement.movementType === PhysicalCustodyMovementType.DEPOSIT ? value.negated() : value;

      const originalUserTx = movement.userGoldAccountTxId
        ? await tx.accountTx.findUnique({ where: { id: movement.userGoldAccountTxId } })
        : null;
      const originalHouseTx = movement.houseGoldAccountTxId
        ? await tx.accountTx.findUnique({ where: { id: movement.houseGoldAccountTxId } })
        : null;

      const userAccount = originalUserTx
        ? { id: originalUserTx.accountId }
        : await this.accountsService.getOrCreateAccount(movement.userId, GOLD_750_INSTRUMENT_CODE, tx);
      const houseAccount = originalHouseTx
        ? { id: originalHouseTx.accountId }
        : await this.accountsService.getOrCreateAccount(HOUSE_USER_ID, GOLD_750_INSTRUMENT_CODE, tx);

      const userDelta = originalUserTx
        ? new Decimal(originalUserTx.delta).negated()
        : reverseForMovementType(deltaEquiv);
      const houseDelta = originalHouseTx
        ? new Decimal(originalHouseTx.delta).negated()
        : reverseForMovementType(deltaEquiv);

      await this.accountsService.applyTransaction(
        tx,
        userAccount,
        userDelta,
        ACCOUNT_TX_TYPE_CUSTODY,
        TX_REF_PHYSICAL_CUSTODY_MOVEMENT,
        movement.id,
        undefined,
        originalUserTx?.id,
      );

      await this.accountsService.applyTransaction(
        tx,
        houseAccount,
        houseDelta,
        ACCOUNT_TX_TYPE_CUSTODY,
        TX_REF_PHYSICAL_CUSTODY_MOVEMENT,
        movement.id,
        undefined,
        originalHouseTx?.id,
      );

      return tx.physicalCustodyMovement.update({
        where: { id: movement.id },
        data: {
          status: PhysicalCustodyMovementStatus.CANCELLED,
          note: dto?.reason ?? movement.note,
          equivGram750: movement.equivGram750 ?? deltaEquiv,
        } as any,
        select: custodyMovementSelect,
      });
    });

    if (updated.status === PhysicalCustodyMovementStatus.CANCELLED) {
      await this.enqueueTahesabDeletionForMovement(updated.id);
    }

    return PhysicalCustodyMapper.toMovementDto(updated as CustodyMovementWithUser);
  }

  async adminListMovements(filters: AdminListMovementsDto) {
    const where: Prisma.PhysicalCustodyMovementWhereInput = {};

    if (filters.status) where.status = filters.status;
    if (filters.userId) where.userId = filters.userId;
    if (filters.mobile) where.user = { mobile: { contains: filters.mobile } };
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {
        ...(filters.fromDate ? { gte: new Date(filters.fromDate) } : {}),
        ...(filters.toDate ? { lte: new Date(filters.toDate) } : {}),
      };
    }

    const take = filters.limit ?? 20;
    const skip = ((filters.page ?? 1) - 1) * take;
    const orderBy = { [filters.sortBy ?? 'createdAt']: filters.order ?? 'desc' } as const;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.physicalCustodyMovement.findMany({
        where,
        orderBy,
        skip,
        take,
        select: custodyMovementSelect,
      }),
      this.prisma.physicalCustodyMovement.count({ where }),
    ]);

    return {
      data: PhysicalCustodyMapper.toMovementDtos(items as CustodyMovementWithUser[]),
      total,
      page: filters.page ?? 1,
      limit: take,
    };
  }

  async adminGetMovementById(id: string) {
    const movement = await this.prisma.physicalCustodyMovement.findUnique({
      where: { id },
      select: custodyMovementSelect,
    });

    if (!movement) throw new NotFoundException('Movement not found');
    return PhysicalCustodyMapper.toMovementDto(movement as CustodyMovementWithUser);
  }

  async adminListPositions(filters: AdminListPositionsDto) {
    const where: Prisma.PhysicalCustodyPositionWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.mobile) where.user = { mobile: { contains: filters.mobile } };

    const positions = await this.prisma.physicalCustodyPosition.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: custodyPositionSelect,
    });

    return PhysicalCustodyMapper.toPositionDtos(positions as CustodyPositionWithUser[]);
  }

  private async enqueueTahesabForPhysicalCustodyMovement(
    movement: CustodyMovementWithUser,
  ): Promise<void> {
    if (!movement || movement.status !== PhysicalCustodyMovementStatus.APPROVED) return;
    if (!this.tahesabIntegration.isEnabled()) return;

    const moshtariCode = this.tahesabIntegration.getCustomerCode(movement.user ?? null);
    if (!moshtariCode) return;

    const { shamsiYear, shamsiMonth, shamsiDay } = this.tahesabIntegration.formatDateParts(
      movement.updatedAt ?? movement.createdAt,
    );

    const normalizedWeight =
      movement.equivGram750 ?? this.toEquivGram750(movement.weightGram, movement.ayar);

    const direction =
      movement.movementType === PhysicalCustodyMovementType.DEPOSIT ? 'deposit' : 'withdrawal';

    const dto: DoNewSanadGoldRequestDto = {
      sabteKolOrMovaghat: SabteKolOrMovaghat.Kol,
      moshtariCode,
      factorNumber: movement.id,
      radifNumber: movement.id,
      shamsiYear,
      shamsiMonth,
      shamsiDay,
      vazn: Number(normalizedWeight),
      ayar: 750,
      angNumber: '',
      nameAz: 'Physical custody',
      isVoroodOrKhorooj:
        movement.movementType === PhysicalCustodyMovementType.DEPOSIT
          ? VoroodOrKhorooj.Vorood
          : VoroodOrKhorooj.Khorooj,
      isMotefaregheOrAbshode: 1,
      sharh: `${this.tahesabIntegration.getDescriptionPrefix()} Custody ${direction} #${movement.id}: ${movement.weightGram}g @ ${movement.ayar} -> ${normalizedWeight}g 750eq`,
      factorCode: this.tahesabIntegration.getGoldAccountCode() ?? undefined,
    };

    await this.tahesabOutbox.enqueueOnce('DoNewSanadVKHGOLD', dto, {
      correlationId: `custody:${movement.id}`,
    });
  }

  private async enqueueTahesabDeletionForMovement(movementId: string): Promise<void> {
    const existing = await this.prisma.tahesabOutbox.findFirst({
      where: {
        correlationId: `custody:${movementId}`,
        method: 'DoNewSanadVKHGOLD',
        status: 'SUCCESS',
        tahesabFactorCode: { not: null },
      },
    });

    if (!existing?.tahesabFactorCode) {
      this.logger.debug(`No Tahesab factor code stored for custody movement ${movementId}; skipping deletion enqueue.`);
      return;
    }

    await this.tahesabOutbox.enqueueOnce('DoDeleteSanad', { factorCode: existing.tahesabFactorCode }, {
      correlationId: `custody:cancel:${movementId}`,
    });
  }
}
