import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AccountTxType,
  CustodyAssetType,
  PhysicalCustodyMovement,
  PhysicalCustodyMovementStatus,
  PhysicalCustodyMovementType,
  PhysicalCustodyPosition,
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

  private getPositionBalance(position: Pick<PhysicalCustodyPosition, 'equivGram750' | 'weightGram' | 'ayar'>): Decimal {
    if (position.equivGram750 !== null && position.equivGram750 !== undefined) {
      return new Decimal(position.equivGram750);
    }
    return this.toEquivGram750(position.weightGram, position.ayar);
  }

  async requestMovement(
    userId: string,
    dto: CreatePhysicalCustodyMovementDto,
  ): Promise<PhysicalCustodyMovement> {
    if (!userId) {
      throw new BadRequestException('Authenticated user is required for custody requests');
    }

    return this.prisma.physicalCustodyMovement.create({
      data: {
        userId,
        assetType: CustodyAssetType.GOLD,
        movementType: dto.movementType,
        status: PhysicalCustodyMovementStatus.PENDING,
        weightGram: new Decimal(dto.weightGram),
        ayar: dto.ayar,
        note: dto.note,
      },
    });
  }

  async approveMovement(id: string): Promise<PhysicalCustodyMovement> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "PhysicalCustodyMovement" WHERE id = ${id} FOR UPDATE`;

      const movement = await tx.physicalCustodyMovement.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!movement) throw new NotFoundException('Movement not found');
      if (movement.status !== PhysicalCustodyMovementStatus.PENDING) {
        return movement;
      }

      const position = await tx.physicalCustodyPosition.upsert({
        where: { userId_assetType: { userId: movement.userId, assetType: movement.assetType } },
        update: {},
        create: {
          userId: movement.userId,
          assetType: movement.assetType,
          weightGram: new Decimal(0),
          ayar: 750,
          equivGram750: new Decimal(0),
        },
      });

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
        },
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
        AccountTxType.CUSTODY,
        TxRefType.PHYSICAL_CUSTODY_MOVEMENT,
        movement.id,
      );

      const { txRecord: houseTx } = await this.accountsService.applyTransaction(
        tx,
        houseGoldAccount,
        walletDelta,
        AccountTxType.CUSTODY,
        TxRefType.PHYSICAL_CUSTODY_MOVEMENT,
        movement.id,
      );

      return tx.physicalCustodyMovement.update({
        where: { id: movement.id },
        data: {
          status: PhysicalCustodyMovementStatus.APPROVED,
          equivGram750: deltaEquiv,
          userGoldAccountTxId: userTx.id,
          houseGoldAccountTxId: houseTx.id,
        },
        include: { user: true },
      });
    });

    await this.enqueueTahesabForPhysicalCustodyMovement(updated);
    return updated;
  }

  async cancelMovement(id: string, dto?: CancelPhysicalCustodyMovementDto): Promise<PhysicalCustodyMovement> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "PhysicalCustodyMovement" WHERE id = ${id} FOR UPDATE`;

      const movement = await tx.physicalCustodyMovement.findUnique({ where: { id }, include: { user: true } });
      if (!movement) throw new NotFoundException('Movement not found');

      if (movement.status === PhysicalCustodyMovementStatus.CANCELLED) {
        return movement;
      }

      if (movement.status === PhysicalCustodyMovementStatus.PENDING) {
        return tx.physicalCustodyMovement.update({
          where: { id: movement.id },
          data: { status: PhysicalCustodyMovementStatus.CANCELLED, note: dto?.reason ?? movement.note },
          include: { user: true },
        });
      }

      if (movement.status !== PhysicalCustodyMovementStatus.APPROVED) {
        return movement;
      }

      const position = await tx.physicalCustodyPosition.findUnique({
        where: { userId_assetType: { userId: movement.userId, assetType: movement.assetType } },
      });
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
        },
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
        AccountTxType.CUSTODY,
        TxRefType.PHYSICAL_CUSTODY_MOVEMENT,
        movement.id,
        undefined,
        originalUserTx?.id,
      );

      await this.accountsService.applyTransaction(
        tx,
        houseAccount,
        houseDelta,
        AccountTxType.CUSTODY,
        TxRefType.PHYSICAL_CUSTODY_MOVEMENT,
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
        },
        include: { user: true },
      });
    });

    if (updated.status === PhysicalCustodyMovementStatus.CANCELLED) {
      await this.enqueueTahesabDeletionForMovement(updated.id);
    }

    return updated;
  }

  private async enqueueTahesabForPhysicalCustodyMovement(
    movement: PhysicalCustodyMovement & { user: { tahesabCustomerCode: string | null } },
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
      sharh: `${this.tahesabIntegration.getDescriptionPrefix()} Custody movement ${movement.id} (${movement.weightGram}g @ ${movement.ayar})`,
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
