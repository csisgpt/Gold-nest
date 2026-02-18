import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentDestination, PaymentDestinationDirection, PaymentDestinationStatus, PaymentDestinationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptDestinationValue,
  encryptDestinationValue,
  hashDestinationValue,
  maskDestinationValue,
  maskOwnerName,
  normalizeDestinationValue,
} from './payment-destinations.crypto';
import {
  CreatePaymentDestinationDto,
  CreateSystemDestinationDto,
  PaymentDestinationViewDto,
  UpdatePaymentDestinationDto,
} from './dto/payment-destination.dto';

export type PaymentDestinationSnapshot = {
  type: PaymentDestinationType;
  value: string;
  maskedValue: string;
  bankName?: string | null;
  ownerName?: string | null;
  title?: string | null;
};

const PaymentDestinationStatusEnum =
  (PaymentDestinationStatus as any) ??
  ({
    ACTIVE: 'ACTIVE',
    PENDING_VERIFY: 'PENDING_VERIFY',
    DISABLED: 'DISABLED',
  } as const);
const PaymentDestinationDirectionEnum =
  (PaymentDestinationDirection as any) ??
  ({
    PAYOUT: 'PAYOUT',
    COLLECTION: 'COLLECTION',
  } as const);
const PaymentDestinationTypeEnum =
  (PaymentDestinationType as any) ??
  ({
    IBAN: 'IBAN',
    CARD: 'CARD',
    ACCOUNT: 'ACCOUNT',
  } as const);

@Injectable()
export class PaymentDestinationsService {
  constructor(private readonly prisma: PrismaService) {}

  private toView(destination: PaymentDestination): PaymentDestinationViewDto {
    return {
      id: destination.id,
      type: destination.type,
      maskedValue: destination.maskedValue,
      bankName: destination.bankName ?? null,
      ownerNameMasked: maskOwnerName(destination.ownerName),
      title: destination.title ?? null,
      isDefault: destination.isDefault,
      status: destination.status,
      lastUsedAt: destination.lastUsedAt ?? null,
    };
  }

  private buildEncryptedPayload(value: string) {
    const normalized = normalizeDestinationValue(value);
    if (normalized.length < 4) {
      throw new BadRequestException({ code: 'P2P_DESTINATION_INVALID', message: 'Destination value is invalid.' });
    }
    const encryptedValueHash = hashDestinationValue(normalized);
    const maskedValue = maskDestinationValue(normalized);
    const encryptedValue = encryptDestinationValue(normalized);

    return { normalized, encryptedValue, encryptedValueHash, maskedValue };
  }

  async listUserPayoutDestinations(userId: string): Promise<PaymentDestinationViewDto[]> {
    const destinations = await this.prisma.paymentDestination.findMany({
      where: {
        ownerUserId: userId,
        direction: PaymentDestinationDirectionEnum.PAYOUT,
        status: PaymentDestinationStatusEnum.ACTIVE,
        deletedAt: null,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return destinations.map((destination) => this.toView(destination));
  }

  async createUserPayoutDestination(
    userId: string,
    dto: CreatePaymentDestinationDto,
  ): Promise<PaymentDestinationViewDto> {
    const { encryptedValue, encryptedValueHash, maskedValue } = this.buildEncryptedPayload(dto.value);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.paymentDestination.findFirst({
        where: {
          ownerUserId: userId,
          direction: PaymentDestinationDirectionEnum.PAYOUT,
          type: dto.type,
          encryptedValueHash,
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException({
          code: 'P2P_DESTINATION_EXISTS',
          message: 'Destination already exists.',
        });
      }

      if (dto.isDefault) {
        await tx.paymentDestination.updateMany({
          where: { ownerUserId: userId, direction: PaymentDestinationDirectionEnum.PAYOUT, deletedAt: null },
          data: { isDefault: false },
        });
      }

      const destination = await tx.paymentDestination.create({
        data: {
          ownerUserId: userId,
          direction: PaymentDestinationDirectionEnum.PAYOUT,
          type: dto.type,
          encryptedValue,
          encryptedValueHash,
          maskedValue,
          bankName: dto.bankName,
          ownerName: dto.ownerName,
          title: dto.title,
          isDefault: dto.isDefault ?? false,
          status: PaymentDestinationStatusEnum.ACTIVE,
        },
      });

      return this.toView(destination);
    });
  }

  async updateUserPayoutDestination(
    userId: string,
    id: string,
    dto: UpdatePaymentDestinationDto,
  ): Promise<PaymentDestinationViewDto> {
    const destination = await this.prisma.paymentDestination.findUnique({ where: { id } });
    if (!destination || destination.deletedAt) throw new NotFoundException('Destination not found');
    if (destination.ownerUserId !== userId) throw new ForbiddenException('Forbidden');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.paymentDestination.updateMany({
          where: { ownerUserId: userId, direction: destination.direction, deletedAt: null },
          data: { isDefault: false },
        });
      }

      const updated = await tx.paymentDestination.update({
        where: { id },
        data: {
          title: dto.title ?? destination.title,
          isDefault: dto.isDefault ?? destination.isDefault,
          status: dto.status ?? destination.status,
        },
      });

      return this.toView(updated);
    });
  }

  async makeDefault(userId: string, id: string): Promise<PaymentDestinationViewDto> {
    const destination = await this.prisma.paymentDestination.findUnique({ where: { id } });
    if (!destination || destination.deletedAt) throw new NotFoundException('Destination not found');
    if (destination.ownerUserId !== userId) throw new ForbiddenException('Forbidden');

    return this.prisma.$transaction(async (tx) => {
      await tx.paymentDestination.updateMany({
        where: { ownerUserId: userId, direction: destination.direction, deletedAt: null },
        data: { isDefault: false },
      });

      const updated = await tx.paymentDestination.update({
        where: { id },
        data: { isDefault: true },
      });

      return this.toView(updated);
    });
  }

  async listAdminDestinations(direction?: PaymentDestinationDirection): Promise<PaymentDestinationViewDto[]> {
    const destinations = await this.prisma.paymentDestination.findMany({
      where: {
        direction,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return destinations.map((destination) => this.toView(destination));
  }



  async listSystemCollectionDestinations(includeInactive = false): Promise<Array<{
    id: string;
    title: string | null;
    bankName: string | null;
    ownerName: string | null;
    maskedValue: string;
    fullValue: string;
    isActive: boolean;
  }>> {
    const destinations = await this.prisma.paymentDestination.findMany({
      where: {
        ownerUserId: null,
        direction: PaymentDestinationDirectionEnum.COLLECTION,
        deletedAt: null,
        ...(includeInactive ? {} : { status: PaymentDestinationStatusEnum.ACTIVE }),
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return destinations.map((destination) => ({
      id: destination.id,
      title: destination.title ?? null,
      bankName: destination.bankName ?? null,
      ownerName: destination.ownerName ?? null,
      maskedValue: destination.maskedValue,
      fullValue: decryptDestinationValue(destination.encryptedValue),
      isActive: destination.status === PaymentDestinationStatusEnum.ACTIVE,
    }));
  }

  async createSystemCollectionDestination(dto: CreateSystemDestinationDto): Promise<PaymentDestinationViewDto> {
    const { encryptedValue, encryptedValueHash, maskedValue } = this.buildEncryptedPayload(dto.value);

    const destination = await this.prisma.paymentDestination.create({
      data: {
        ownerUserId: null,
        direction: PaymentDestinationDirectionEnum.COLLECTION,
        type: dto.type,
        encryptedValue,
        encryptedValueHash,
        maskedValue,
        bankName: dto.bankName,
        ownerName: dto.ownerName,
        title: dto.title,
        isDefault: dto.isDefault ?? false,
        status: PaymentDestinationStatusEnum.ACTIVE,
      },
    });

    return this.toView(destination);
  }

  async resolvePayoutDestinationForUser(userId: string, destinationId: string): Promise<PaymentDestinationSnapshot> {
    const destination = await this.prisma.paymentDestination.findUnique({ where: { id: destinationId } });
    if (!destination || destination.deletedAt) throw new NotFoundException('Destination not found');
    if (destination.ownerUserId !== userId) throw new ForbiddenException('Forbidden');
    if (destination.status !== PaymentDestinationStatusEnum.ACTIVE) {
      throw new BadRequestException({ code: 'P2P_DESTINATION_INACTIVE', message: 'Destination is not active.' });
    }

    const decryptedValue = decryptDestinationValue(destination.encryptedValue);

    return {
      type: destination.type,
      value: decryptedValue,
      maskedValue: destination.maskedValue,
      bankName: destination.bankName ?? null,
      ownerName: destination.ownerName ?? null,
      title: destination.title ?? null,
    };
  }

  async resolveCollectionDestination(destinationId: string): Promise<PaymentDestinationSnapshot> {
    const destination = await this.prisma.paymentDestination.findUnique({ where: { id: destinationId } });
    if (!destination || destination.deletedAt) throw new NotFoundException('Destination not found');
    if (destination.ownerUserId !== null || destination.direction !== PaymentDestinationDirectionEnum.COLLECTION) {
      throw new BadRequestException({ code: 'P2P_DESTINATION_INVALID', message: 'Destination is not a system collection account.' });
    }
    if (destination.status !== PaymentDestinationStatusEnum.ACTIVE) {
      throw new BadRequestException({ code: 'P2P_DESTINATION_INACTIVE', message: 'Destination is not active.' });
    }

    const decryptedValue = decryptDestinationValue(destination.encryptedValue);

    return {
      type: destination.type,
      value: decryptedValue,
      maskedValue: destination.maskedValue,
      bankName: destination.bankName ?? null,
      ownerName: destination.ownerName ?? null,
      title: destination.title ?? null,
    };
  }

  buildLegacySnapshot(params: {
    iban?: string | null;
    cardNumber?: string | null;
    bankName?: string | null;
    ownerName?: string | null;
  }): PaymentDestinationSnapshot | null {
    const raw = params.iban || params.cardNumber;
    if (!raw) return null;
    const normalized = normalizeDestinationValue(raw);
    return {
      type: params.iban ? PaymentDestinationTypeEnum.IBAN : PaymentDestinationTypeEnum.CARD,
      value: normalized,
      maskedValue: maskDestinationValue(normalized),
      bankName: params.bankName ?? null,
      ownerName: params.ownerName ?? null,
    };
  }
}
