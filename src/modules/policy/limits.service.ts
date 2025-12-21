import { Injectable, NotFoundException } from '@nestjs/common';
import {
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
import { PolicyResolverService } from './policy-resolver.service';

const DEFAULT_INSTRUMENT_KEY = 'ALL';

@Injectable()
export class LimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periodKeyService: PeriodKeyService,
    private readonly policyResolver: PolicyResolverService,
  ) {}

  async reserve(params: {
    userId: string;
    action: PolicyAction;
    metric: PolicyMetric;
    period: PolicyPeriod;
    amount: Decimal.Value;
    instrumentKey?: string;
    refType: string;
    refId: string;
  }) {
    const amount = dec(params.amount);
    const instrumentKey = params.instrumentKey ?? DEFAULT_INSTRUMENT_KEY;
    const periodKey =
      params.period === PolicyPeriod.MONTHLY
        ? this.periodKeyService.getMonthlyKey()
        : this.periodKeyService.getDailyKey();

    return this.prisma.$transaction(async (tx) => {
      const applicable = await this.policyResolver.getApplicableRulesForRequest(
        {
          userId: params.userId,
          action: params.action as any,
          metric: params.metric as any,
          period: params.period,
          instrumentId: instrumentKey !== DEFAULT_INSTRUMENT_KEY ? instrumentKey : undefined,
          instrumentType: null,
        },
        tx,
      );

      if (applicable.kycRequiredLevel) {
        throw new PolicyViolationException('KYC_REQUIRED', 'User KYC level insufficient for limit');
      }

      const usage = await tx.limitUsage.upsert({
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

      await tx.$executeRawUnsafe(`SELECT 1 FROM "LimitUsage" WHERE id = $1 FOR UPDATE`, usage.id);
      const lockedUsage = await tx.limitUsage.findUnique({ where: { id: usage.id } });
      if (!lockedUsage) throw new NotFoundException('Limit usage not found');

      const projected = dec(lockedUsage.usedAmount).add(lockedUsage.reservedAmount).add(amount);

      if (applicable.effectiveLimit && projected.gt(applicable.effectiveLimit)) {
        throw new PolicyViolationException('LIMIT_EXCEEDED', 'Policy limit exceeded');
      }

      const existingReservation = await tx.limitReservation.findUnique({
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

      const reservation = await tx.limitReservation.create({
        data: {
          usageId: lockedUsage.id,
          userId: params.userId,
          amount,
          refId: params.refId,
          refType: params.refType,
          status: LimitReservationStatus.RESERVED,
        },
      });

      const updatedUsage = await tx.limitUsage.update({
        where: { id: lockedUsage.id },
        data: { reservedAmount: addDec(lockedUsage.reservedAmount, amount) },
      });

      return { usage: updatedUsage, reservation };
    });
  }

  async consume(params: { refType: string; refId: string }) {
    return this.prisma.$transaction(async (tx) => {
      const reservations = await tx.limitReservation.findMany({
        where: { refType: params.refType, refId: params.refId },
      });

      for (const reservation of reservations) {
        if (reservation.status === LimitReservationStatus.CONSUMED) continue;

        await tx.$executeRawUnsafe(`SELECT 1 FROM "LimitUsage" WHERE id = $1 FOR UPDATE`, reservation.usageId);
        const usage = await tx.limitUsage.findUnique({ where: { id: reservation.usageId } });
        if (!usage) continue;

        const newReserved = subDec(usage.reservedAmount, reservation.amount);
        const newUsed = addDec(usage.usedAmount, reservation.amount);

        await tx.limitUsage.update({
          where: { id: usage.id },
          data: { reservedAmount: newReserved, usedAmount: newUsed },
        });

        await tx.limitReservation.update({
          where: { id: reservation.id },
          data: { status: LimitReservationStatus.CONSUMED },
        });
      }
    });
  }

  async release(params: { refType: string; refId: string }) {
    return this.prisma.$transaction(async (tx) => {
      const reservations = await tx.limitReservation.findMany({
        where: { refType: params.refType, refId: params.refId },
      });

      for (const reservation of reservations) {
        if (reservation.status !== LimitReservationStatus.RESERVED) continue;

        await tx.$executeRawUnsafe(`SELECT 1 FROM "LimitUsage" WHERE id = $1 FOR UPDATE`, reservation.usageId);
        const usage = await tx.limitUsage.findUnique({ where: { id: reservation.usageId } });
        if (!usage) continue;

        const newReserved = subDec(usage.reservedAmount, reservation.amount);

        await tx.limitUsage.update({
          where: { id: usage.id },
          data: { reservedAmount: newReserved },
        });

        await tx.limitReservation.update({
          where: { id: reservation.id },
          data: { status: LimitReservationStatus.RELEASED },
        });
      }
    });
  }
}
