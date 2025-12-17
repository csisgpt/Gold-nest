import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CustodyAssetType,
  PhysicalCustodyMovement,
  PhysicalCustodyMovementStatus,
  PhysicalCustodyMovementType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePhysicalCustodyMovementDto } from './dto/create-physical-custody-movement.dto';
import { CancelPhysicalCustodyMovementDto } from './dto/cancel-physical-custody-movement.dto';
import { TahesabOutboxService } from '../tahesab/tahesab-outbox.service';
import { TahesabIntegrationConfigService } from '../tahesab/tahesab-integration.config';
import { SabteKolOrMovaghat, VoroodOrKhorooj } from '../tahesab/tahesab.methods';
import { DoNewSanadGoldRequestDto } from '../tahesab/dto/sanad.dto';

@Injectable()
export class PhysicalCustodyService {
  private readonly logger = new Logger(PhysicalCustodyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tahesabOutbox: TahesabOutboxService,
    private readonly tahesabIntegration: TahesabIntegrationConfigService,
  ) {}

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
          ayar: movement.ayar,
        },
      });

      const delta = new Decimal(movement.weightGram);
      if (movement.movementType === PhysicalCustodyMovementType.WITHDRAWAL) {
        if (new Decimal(position.weightGram).lt(delta)) {
          throw new BadRequestException('Insufficient custody balance');
        }
      }

      const newWeight =
        movement.movementType === PhysicalCustodyMovementType.DEPOSIT
          ? new Decimal(position.weightGram).plus(delta)
          : new Decimal(position.weightGram).minus(delta);

      await tx.physicalCustodyPosition.update({
        where: { id: position.id },
        data: { weightGram: newWeight },
      });

      return tx.physicalCustodyMovement.update({
        where: { id: movement.id },
        data: { status: PhysicalCustodyMovementStatus.APPROVED },
        include: { user: true },
      });
    });

    await this.enqueueTahesabForPhysicalCustodyMovement(updated);
    return updated;
  }

  async cancelMovement(id: string, dto?: CancelPhysicalCustodyMovementDto): Promise<PhysicalCustodyMovement> {
    const updated = await this.prisma.$transaction(async (tx) => {
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

      const delta = new Decimal(movement.weightGram);
      const newWeight =
        movement.movementType === PhysicalCustodyMovementType.DEPOSIT
          ? new Decimal(position.weightGram).minus(delta)
          : new Decimal(position.weightGram).plus(delta);

      if (newWeight.lt(0)) {
        throw new BadRequestException('Reversal would make custody negative');
      }

      await tx.physicalCustodyPosition.update({ where: { id: position.id }, data: { weightGram: newWeight } });

      return tx.physicalCustodyMovement.update({
        where: { id: movement.id },
        data: { status: PhysicalCustodyMovementStatus.CANCELLED, note: dto?.reason ?? movement.note },
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

    const dto: DoNewSanadGoldRequestDto = {
      sabteKolOrMovaghat: SabteKolOrMovaghat.Kol,
      moshtariCode,
      factorNumber: movement.id,
      radifNumber: movement.id,
      shamsiYear,
      shamsiMonth,
      shamsiDay,
      vazn: Number(movement.weightGram),
      ayar: movement.ayar,
      angNumber: '',
      nameAz: 'Physical custody',
      isVoroodOrKhorooj:
        movement.movementType === PhysicalCustodyMovementType.DEPOSIT
          ? VoroodOrKhorooj.Vorood
          : VoroodOrKhorooj.Khorooj,
      isMotefaregheOrAbshode: 1,
      sharh: `${this.tahesabIntegration.getDescriptionPrefix()} Custody movement ${movement.id}`,
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
