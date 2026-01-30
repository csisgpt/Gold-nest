import { DepositStatus, WithdrawStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { dec } from '../../common/utils/decimal.util';

const WithdrawStatusEnum =
  (WithdrawStatus as any) ??
  ({
    CREATED: 'CREATED',
    VALIDATED: 'VALIDATED',
    WAITING_ASSIGNMENT: 'WAITING_ASSIGNMENT',
    PARTIALLY_ASSIGNED: 'PARTIALLY_ASSIGNED',
    FULLY_ASSIGNED: 'FULLY_ASSIGNED',
    PARTIALLY_SETTLED: 'PARTIALLY_SETTLED',
    SETTLED: 'SETTLED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
  } as const);

const DepositStatusEnum =
  (DepositStatus as any) ??
  ({
    CREATED: 'CREATED',
    WAITING_ASSIGNMENT: 'WAITING_ASSIGNMENT',
    PARTIALLY_ASSIGNED: 'PARTIALLY_ASSIGNED',
    FULLY_ASSIGNED: 'FULLY_ASSIGNED',
    PARTIALLY_SETTLED: 'PARTIALLY_SETTLED',
    SETTLED: 'SETTLED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
  } as const);

export function deriveWithdrawP2PStatus(params: {
  amount: Decimal.Value;
  assignedTotal: Decimal.Value;
  settledTotal: Decimal.Value;
  cancelled?: boolean;
  expired?: boolean;
}): WithdrawStatus {
  if (params.cancelled) return WithdrawStatusEnum.CANCELLED;
  if (params.expired) return WithdrawStatusEnum.EXPIRED;

  const amount = dec(params.amount);
  const assigned = dec(params.assignedTotal);
  const settled = dec(params.settledTotal);

  if (settled.gte(amount)) return WithdrawStatusEnum.SETTLED;
  if (settled.gt(0)) return WithdrawStatusEnum.PARTIALLY_SETTLED;
  if (assigned.gte(amount)) return WithdrawStatusEnum.FULLY_ASSIGNED;
  if (assigned.gt(0)) return WithdrawStatusEnum.PARTIALLY_ASSIGNED;
  return WithdrawStatusEnum.WAITING_ASSIGNMENT;
}

export function deriveDepositP2PStatus(params: {
  requestedAmount: Decimal.Value;
  assignedTotal: Decimal.Value;
  settledTotal: Decimal.Value;
  cancelled?: boolean;
  expired?: boolean;
}): DepositStatus {
  if (params.cancelled) return DepositStatusEnum.CANCELLED;
  if (params.expired) return DepositStatusEnum.EXPIRED;

  const amount = dec(params.requestedAmount);
  const assigned = dec(params.assignedTotal);
  const settled = dec(params.settledTotal);

  if (settled.gte(amount)) return DepositStatusEnum.SETTLED;
  if (settled.gt(0)) return DepositStatusEnum.PARTIALLY_SETTLED;
  if (assigned.gte(amount)) return DepositStatusEnum.FULLY_ASSIGNED;
  if (assigned.gt(0)) return DepositStatusEnum.PARTIALLY_ASSIGNED;
  return DepositStatusEnum.WAITING_ASSIGNMENT;
}
