import { Injectable, NotFoundException } from '@nestjs/common';
import {
  KycLevel,
  LimitReservationStatus,
  PolicyAction,
  PolicyMetric,
  PolicyPeriod,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { PeriodKeyService } from './period-key.service';
import { PolicyResolverService } from './policy-resolver.service';
import { PolicyViolationException } from '../../common/exceptions/policy-violation.exception';

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
    const amount = new Decimal(params.amount);
    const instrumentKey = params.instrumentKey ?? DEFAULT_INSTRUMENT_KEY;
    const periodKey =
      params.period === PolicyPeriod.MONTHLY
        ? this.periodKeyService.getMonthlyKey()
        : this.periodKeyService.getDailyKey();

    return this.prisma.$transaction(async (tx) => {
      const effective = await this.policyResolver.getEffectiveRules(params.userId);

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

      const applicableRules = this.policyResolver.findApplicableRules({
        rules: effective.rules,
        action: params.action as any,
        metric: params.metric as any,
        period: params.period,
        instrumentId: instrumentKey !== DEFAULT_INSTRUMENT_KEY ? instrumentKey : undefined,
        instrumentType: null,
      });

      const requiredKyc = applicableRules.reduce<KycLevel>((max, rule) => {
        const order = [KycLevel.NONE, KycLevel.BASIC, KycLevel.FULL];
        return order.indexOf(rule.minKycLevel) > order.indexOf(max) ? rule.minKycLevel : max;
      }, KycLevel.NONE);

      if (!this.policyResolver.hasRequiredKyc(effective.userKyc?.level, requiredKyc)) {
        throw new PolicyViolationException('KYC_REQUIRED', 'User KYC level insufficient for limit');
      }

      const effectiveLimit = this.policyResolver.computeEffectiveLimit(applicableRules);
      const projected = new Decimal(lockedUsage.usedAmount)
        .add(lockedUsage.reservedAmount)
        .add(amount);

      if (effectiveLimit.isFinite() && projected.gt(effectiveLimit)) {
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
        if (existingReservation.status === LimitReservationStatus.RELEASED) {
          return { usage: lockedUsage, reservation: existingReservation };
        }

        if (existingReservation.status === LimitReservationStatus.CONSUMED) {
          return { usage: lockedUsage, reservation: existingReservation };
        }

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
        data: { reservedAmount: new Decimal(lockedUsage.reservedAmount).add(amount) },
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

        const newReserved = new Decimal(usage.reservedAmount).minus(reservation.amount);
        const newUsed = new Decimal(usage.usedAmount).add(reservation.amount);

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

        const newReserved = new Decimal(usage.reservedAmount).minus(reservation.amount);

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
