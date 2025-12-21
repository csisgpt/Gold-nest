import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  InstrumentType,
  LimitReservationStatus,
  PolicyAction,
  PolicyMetric,
  PolicyPeriod,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PolicyViolationException } from '../../common/exceptions/policy-violation.exception';
import { addDec, dec, subDec } from '../../common/utils/decimal.util';
import { PrismaService } from '../prisma/prisma.service';
import { PeriodKeyService } from './period-key.service';
import { PolicyContextBuilder } from './policy-context-builder.service';
import { PolicyResolutionService } from './policy-resolution.service';

const DEFAULT_INSTRUMENT_KEY = 'ALL';
const LimitReservationStatusEnum =
  (LimitReservationStatus as any) ?? ({ RESERVED: 'RESERVED', CONSUMED: 'CONSUMED', RELEASED: 'RELEASED' } as const);
const PolicyPeriodEnum = (PolicyPeriod as any) ?? ({ DAILY: 'DAILY', MONTHLY: 'MONTHLY' } as const);

@Injectable()
export class LimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periodKeyService: PeriodKeyService,
    private readonly policyResolver: PolicyResolutionService,
    private readonly policyContextBuilder: PolicyContextBuilder,
  ) {}

  async reserve(
    params: {
      userId: string;
      action: PolicyAction;
      metric: PolicyMetric;
      period: PolicyPeriod;
      amount: Decimal.Value;
      instrumentKey?: string;
      instrumentId?: string;
      instrumentType?: InstrumentType | null;
      productId?: string;
      refType: string;
      refId: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const amount = dec(params.amount);
    const instrumentKey = params.instrumentKey ?? params.productId ?? params.instrumentId ?? DEFAULT_INSTRUMENT_KEY;
    const periodKey =
      params.period === PolicyPeriodEnum.MONTHLY
        ? this.periodKeyService.getMonthlyKey()
        : this.periodKeyService.getDailyKey();

    const executor = async (db: Prisma.TransactionClient) => {
      let instrumentType = params.instrumentType ?? null;
      let instrumentId = params.instrumentId ?? null;

      if (params.productId) {
        const built = await this.policyContextBuilder.buildFromMarketProduct(params.productId, db);
        instrumentId = instrumentId ?? built.instrumentId;
        instrumentType = instrumentType ?? built.instrumentType;
      }

      if (!instrumentType && instrumentId) {
        const instrument = await db.instrument.findUnique({ where: { id: instrumentId } });
        instrumentType = instrument?.type ?? null;
      }

      const applicable = await this.policyResolver.resolve({
        action: params.action as any,
        metric: params.metric as any,
        period: params.period,
        context: {
          userId: params.userId,
          instrumentId: instrumentId ?? undefined,
          instrumentType: instrumentType ?? undefined,
          productId: params.productId,
        },
      }, db);

      const usage = await db.limitUsage.upsert({
        where: {
          userId_action_metric_period_periodKey_instrumentKey: {
            userId: params.userId,
            action: params.action as any,
            metric: params.metric as any,
            period: params.period,
            periodKey,
            instrumentKey,
          },
        },
        create: {
          userId: params.userId,
          action: params.action as any,
          metric: params.metric as any,
          period: params.period,
          periodKey,
          instrumentKey,
        },
        update: {},
      });

      await db.$executeRawUnsafe(`SELECT 1 FROM "LimitUsage" WHERE id = $1 FOR UPDATE`, usage.id);
      const lockedUsage = await db.limitUsage.findUnique({ where: { id: usage.id } });
      if (!lockedUsage) throw new NotFoundException('Limit usage not found');

      const projected = dec(lockedUsage.usedAmount).add(lockedUsage.reservedAmount).add(amount);

      if (!applicable.value && applicable.kycRequiredLevel) {
        throw new PolicyViolationException('KYC_REQUIRED', 'User KYC level insufficient for limit');
      }

      if (applicable.value && projected.gt(applicable.value)) {
        throw new PolicyViolationException('LIMIT_EXCEEDED', 'Policy limit exceeded');
      }

      const existingReservation = await db.limitReservation.findUnique({
        where: {
          refType_refId_usageId: {
            refId: params.refId,
            refType: params.refType,
            usageId: lockedUsage.id,
          },
        },
      });

      if (existingReservation) {
        return { usage: lockedUsage, reservation: existingReservation };
      }

      const reservation = await db.limitReservation.create({
        data: {
          usageId: lockedUsage.id,
          userId: params.userId,
          amount,
          refId: params.refId,
          refType: params.refType,
          status: LimitReservationStatusEnum.RESERVED as any,
        },
      });

      const updatedUsage = await db.limitUsage.update({
        where: { id: lockedUsage.id },
        data: { reservedAmount: addDec(lockedUsage.reservedAmount, amount) },
      });

      return { usage: updatedUsage, reservation };
    };

    if (tx) return executor(tx);
    return this.prisma.$transaction((client) => executor(client));
  }

  async consume(params: { refType: string; refId: string }, tx?: Prisma.TransactionClient) {
    const executor = async (db: Prisma.TransactionClient) => {
      const reservations = await db.limitReservation.findMany({
        where: { refType: params.refType, refId: params.refId },
      });

      for (const reservation of reservations) {
        if (reservation.status === LimitReservationStatusEnum.CONSUMED) continue;

        await db.$executeRawUnsafe(`SELECT 1 FROM "LimitUsage" WHERE id = $1 FOR UPDATE`, reservation.usageId);
        const usage = await db.limitUsage.findUnique({ where: { id: reservation.usageId } });
        if (!usage) continue;

        const newReserved = subDec(usage.reservedAmount, reservation.amount);
        const newUsed = addDec(usage.usedAmount, reservation.amount);

        await db.limitUsage.update({
          where: { id: usage.id },
          data: { reservedAmount: newReserved, usedAmount: newUsed },
        });

        await db.limitReservation.update({
          where: { id: reservation.id },
          data: { status: LimitReservationStatusEnum.CONSUMED as any },
        });
      }
    };

    if (tx) return executor(tx);
    return this.prisma.$transaction((client) => executor(client));
  }

  async release(params: { refType: string; refId: string }, tx?: Prisma.TransactionClient) {
    const executor = async (db: Prisma.TransactionClient) => {
      const reservations = await db.limitReservation.findMany({
        where: { refType: params.refType, refId: params.refId },
      });

      for (const reservation of reservations) {
        if (reservation.status !== LimitReservationStatusEnum.RESERVED) continue;

        await db.$executeRawUnsafe(`SELECT 1 FROM "LimitUsage" WHERE id = $1 FOR UPDATE`, reservation.usageId);
        const usage = await db.limitUsage.findUnique({ where: { id: reservation.usageId } });
        if (!usage) continue;

        const newReserved = subDec(usage.reservedAmount, reservation.amount);

        await db.limitUsage.update({
          where: { id: usage.id },
          data: { reservedAmount: newReserved },
        });

        await db.limitReservation.update({
          where: { id: reservation.id },
          data: { status: LimitReservationStatusEnum.RELEASED as any },
        });
      }
    };

    if (tx) return executor(tx);
    return this.prisma.$transaction((client) => executor(client));
  }
}
