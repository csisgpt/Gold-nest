import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AccountTxType,
  CustodyAssetType,
  PhysicalCustodyMovementStatus,
  PhysicalCustodyMovementType,
  PolicyAction,
  PolicyMetric,
  PolicyPeriod,
  Prisma,
  TxRefType,
} from '@prisma/client';
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
import { LimitsService } from '../policy/limits.service';
import { runInTx } from '../../common/db/tx.util';

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
    private readonly limitsService: LimitsService,
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
    idempotencyKey?: string,
  ): Promise<CustodyMovementWithUser> {
    if (!userId) {
      throw new BadRequestException('Authenticated user is required for custody requests');
    }

    const weight = new Decimal(dto.weightGram);
    if (weight.lte(0)) {
      throw new BadRequestException('Weight must be positive');
    }

    const equiv = this.toEquivGram750(weight, dto.ayar);

    return runInTx(this.prisma, async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.physicalCustodyMovement.findFirst({
          where: { userId, idempotencyKey },
          select: custodyMovementSelect,
        });
        if (existing) {
          return existing as CustodyMovementWithUser;
        }
      }

      const instrument = await tx.instrument.findUnique({
        where: { code: GOLD_750_INSTRUMENT_CODE },
        select: { id: true, type: true, code: true },
      });
      if (!instrument) {
        throw new NotFoundException('Gold instrument not configured');
      }

      const movement = await tx.physicalCustodyMovement.create({
        data: {
          userId,
          assetType: CustodyAssetType.GOLD,
          movementType: dto.movementType,
          status: PhysicalCustodyMovementStatus.PENDING,
          weightGram: weight,
          ayar: dto.ayar,
          equivGram750: equiv,
          note: dto.note,
          idempotencyKey,
        },
        select: custodyMovementSelect,
      });

      const action =
        dto.movementType === PhysicalCustodyMovementType.DEPOSIT
          ? PolicyAction.CUSTODY_IN
          : PolicyAction.CUSTODY_OUT;

      await this.limitsService.reserve(
        {
          userId,
          action,
          metric: PolicyMetric.WEIGHT_750_G,
          period: PolicyPeriod.DAILY,
          amount: equiv,
          instrumentId: instrument.id,
          instrumentType: instrument.type,
          refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT,
          refId: movement.id,
        },
        tx,
      );

      await this.limitsService.reserve(
        {
          userId,
          action,
          metric: PolicyMetric.WEIGHT_750_G,
          period: PolicyPeriod.MONTHLY,
          amount: equiv,
          instrumentId: instrument.id,
          instrumentType: instrument.type,
          refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT,
          refId: movement.id,
        },
        tx,
      );

      if (dto.movementType === PhysicalCustodyMovementType.WITHDRAWAL) {
        await this.accountsService.reserveFunds({
          userId,
          instrumentCode: instrument.code,
          amount: equiv,
          refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT,
          refId: movement.id,
          tx,
        });
      }

      return movement as CustodyMovementWithUser;
    }, { logger: this.logger });
  }

  async approveMovement(id: string, adminId?: string): Promise<PhysicalCustodyMovementResponseDto> {
    const updated = await runInTx(
      this.prisma,
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "PhysicalCustodyMovement" WHERE id = ${id} FOR UPDATE`;

        const movement = await tx.physicalCustodyMovement.findUnique({
          where: { id },
          select: custodyMovementSelect,
        });
        if (!movement) throw new NotFoundException('Movement not found');
        if (movement.status === PhysicalCustodyMovementStatus.APPROVED) {
          return movement;
        }

        if (movement.status !== PhysicalCustodyMovementStatus.PENDING) {
          throw new BadRequestException('INVALID_STATUS');
        }

        const deltaEquiv =
          movement.equivGram750 !== null && movement.equivGram750 !== undefined
            ? new Decimal(movement.equivGram750)
            : this.toEquivGram750(movement.weightGram, movement.ayar);

        if (movement.movementType === PhysicalCustodyMovementType.WITHDRAWAL) {
          await this.accountsService.consumeFunds({
            userId: movement.userId,
            instrumentCode: GOLD_750_INSTRUMENT_CODE,
            refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT,
            refId: movement.id,
            tx,
          });
        }

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

        const userDelta =
          movement.movementType === PhysicalCustodyMovementType.DEPOSIT ? deltaEquiv : deltaEquiv.negated();
        const houseDelta = userDelta.negated();

        const { txRecord: userTx } = await this.accountsService.applyTransaction(
          tx,
          userGoldAccount,
          userDelta,
          ACCOUNT_TX_TYPE_CUSTODY,
          TX_REF_PHYSICAL_CUSTODY_MOVEMENT,
          movement.id,
          adminId,
        );

        const { txRecord: houseTx } = await this.accountsService.applyTransaction(
          tx,
          houseGoldAccount,
          houseDelta,
          ACCOUNT_TX_TYPE_CUSTODY,
          TX_REF_PHYSICAL_CUSTODY_MOVEMENT,
          movement.id,
          adminId,
        );

        await this.limitsService.consume({ refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT, refId: movement.id }, tx);

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
      },
      { logger: this.logger },
    );

    await this.enqueueTahesabForPhysicalCustodyMovement(updated as CustodyMovementWithUser);
    return PhysicalCustodyMapper.toMovementDto(updated as CustodyMovementWithUser);
  }

  async cancelMovement(id: string, dto?: CancelPhysicalCustodyMovementDto): Promise<PhysicalCustodyMovementResponseDto> {
    const updated = await runInTx(
      this.prisma,
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "PhysicalCustodyMovement" WHERE id = ${id} FOR UPDATE`;

        const movement = await tx.physicalCustodyMovement.findUnique({ where: { id }, select: custodyMovementSelect });
        if (!movement) throw new NotFoundException('Movement not found');

        if (
          movement.status === PhysicalCustodyMovementStatus.CANCELLED ||
          movement.status === PhysicalCustodyMovementStatus.REJECTED
        ) {
          return movement;
        }

        if (movement.status !== PhysicalCustodyMovementStatus.PENDING) {
          throw new BadRequestException('INVALID_STATUS');
        }

        await this.limitsService.release({ refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT, refId: movement.id }, tx);
        if (movement.movementType === PhysicalCustodyMovementType.WITHDRAWAL) {
          await this.accountsService.releaseFunds({
            userId: movement.userId,
            instrumentCode: GOLD_750_INSTRUMENT_CODE,
            refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT,
            refId: movement.id,
            tx,
          });
        }

        return tx.physicalCustodyMovement.update({
          where: { id: movement.id },
          data: {
            status: PhysicalCustodyMovementStatus.CANCELLED,
            note: dto?.reason ?? movement.note,
          } as any,
          select: custodyMovementSelect,
        });
      },
      { logger: this.logger },
    );

    if (updated.status === PhysicalCustodyMovementStatus.CANCELLED) {
      await this.enqueueTahesabDeletionForMovement(updated.id);
    }

    return PhysicalCustodyMapper.toMovementDto(updated as CustodyMovementWithUser);
  }

  async rejectMovement(id: string, dto?: CancelPhysicalCustodyMovementDto) {
    const updated = await runInTx(
      this.prisma,
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "PhysicalCustodyMovement" WHERE id = ${id} FOR UPDATE`;

        const movement = await tx.physicalCustodyMovement.findUnique({ where: { id }, select: custodyMovementSelect });
        if (!movement) throw new NotFoundException('Movement not found');

        if (movement.status === PhysicalCustodyMovementStatus.REJECTED) {
          return movement;
        }

        if (movement.status !== PhysicalCustodyMovementStatus.PENDING) {
          throw new BadRequestException('INVALID_STATUS');
        }

        await this.limitsService.release({ refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT, refId: movement.id }, tx);
        if (movement.movementType === PhysicalCustodyMovementType.WITHDRAWAL) {
          await this.accountsService.releaseFunds({
            userId: movement.userId,
            instrumentCode: GOLD_750_INSTRUMENT_CODE,
            refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT,
            refId: movement.id,
            tx,
          });
        }

        return tx.physicalCustodyMovement.update({
          where: { id: movement.id },
          data: {
            status: PhysicalCustodyMovementStatus.REJECTED,
            note: dto?.reason ?? movement.note,
          } as any,
          select: custodyMovementSelect,
        });
      },
      { logger: this.logger },
    );

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
