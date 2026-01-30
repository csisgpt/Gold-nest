import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Decimal } from '@prisma/client/runtime/library';
import {
  P2PAllocationStatus,
  RequestPurpose,
  TxRefType,
  DepositStatus,
  WithdrawStatus,
  AttachmentLinkEntityType,
  AttachmentLinkKind,
  PaymentMethod,
} from '@prisma/client';
import { P2PAllocationsService } from '../src/modules/p2p-allocations/p2p-allocations.service';
import { PaginationService } from '../src/common/pagination/pagination.service';
import { PaymentDestinationsService } from '../src/modules/payment-destinations/payment-destinations.service';

const P2PAllocationStatusEnum =
  (P2PAllocationStatus as any) ??
  ({
    ASSIGNED: 'ASSIGNED',
    PROOF_SUBMITTED: 'PROOF_SUBMITTED',
    RECEIVER_CONFIRMED: 'RECEIVER_CONFIRMED',
    ADMIN_VERIFIED: 'ADMIN_VERIFIED',
    SETTLED: 'SETTLED',
  } as const);
const RequestPurposeEnum =
  (RequestPurpose as any) ??
  ({
    DIRECT: 'DIRECT',
    P2P: 'P2P',
  } as const);
const DepositStatusEnum =
  (DepositStatus as any) ??
  ({
    WAITING_ASSIGNMENT: 'WAITING_ASSIGNMENT',
  } as const);
const WithdrawStatusEnum =
  (WithdrawStatus as any) ??
  ({
    WAITING_ASSIGNMENT: 'WAITING_ASSIGNMENT',
  } as const);

function makeFakePrisma() {
  const state = {
    withdrawal: {
      id: 'wd-1',
      userId: 'user-w',
      amount: new Decimal(100),
      assignedAmountTotal: new Decimal(0),
      settledAmountTotal: new Decimal(0),
      purpose: RequestPurposeEnum.P2P,
      status: WithdrawStatusEnum.WAITING_ASSIGNMENT,
      channel: 'USER_TO_USER',
      iban: 'IR1234567890',
      cardNumber: null,
      bankName: 'TestBank',
      destinationSnapshot: { type: 'IBAN', value: 'IR1234567890', maskedValue: '****7890', bankName: 'TestBank' },
    },
    deposit: {
      id: 'dp-1',
      userId: 'user-p',
      amount: new Decimal(50),
      remainingAmount: new Decimal(50),
      assignedAmountTotal: new Decimal(0),
      settledAmountTotal: new Decimal(0),
      purpose: RequestPurposeEnum.P2P,
      status: DepositStatusEnum.WAITING_ASSIGNMENT,
    },
    allocations: [] as any[],
    accountReservations: [
      {
        id: 'ar-1',
        accountId: 'acc-user-w',
        amount: new Decimal(100),
        refType: TxRefType.WITHDRAW,
        refId: 'wd-1',
        status: 'RESERVED',
      },
    ],
    limitReservations: [
      {
        id: 'lr-1',
        usageId: 'usage-1',
        userId: 'user-w',
        amount: new Decimal(100),
        refType: TxRefType.WITHDRAW,
        refId: 'wd-1',
        status: 'RESERVED',
      },
    ],
    idempotency: [] as any[],
    attachmentLinks: [] as any[],
  };

  const prisma = {
    $transaction: async (fn: any) => fn(prisma),
    $queryRaw: async () => [],
    withdrawRequest: {
      findUnique: async ({ where }: any) => (where.id === state.withdrawal.id ? state.withdrawal : null),
      update: async ({ where, data }: any) => {
        if (where.id !== state.withdrawal.id) throw new Error('withdrawal not found');
        state.withdrawal.assignedAmountTotal = new Decimal(data.assignedAmountTotal ?? state.withdrawal.assignedAmountTotal);
        state.withdrawal.settledAmountTotal = new Decimal(data.settledAmountTotal ?? state.withdrawal.settledAmountTotal);
        state.withdrawal.status = data.status ?? state.withdrawal.status;
        return state.withdrawal;
      },
    },
    depositRequest: {
      findMany: async ({ where }: any) => {
        if (where.id?.in?.includes(state.deposit.id)) return [state.deposit];
        return [];
      },
      update: async ({ where, data }: any) => {
        if (where.id !== state.deposit.id) throw new Error('deposit not found');
        state.deposit.assignedAmountTotal = new Decimal(data.assignedAmountTotal ?? state.deposit.assignedAmountTotal);
        state.deposit.remainingAmount = new Decimal(data.remainingAmount ?? state.deposit.remainingAmount);
        state.deposit.settledAmountTotal = new Decimal(data.settledAmountTotal ?? state.deposit.settledAmountTotal);
        state.deposit.status = data.status ?? state.deposit.status;
        return state.deposit;
      },
    },
    p2PAllocation: {
      create: async ({ data }: any) => {
        const allocation = {
          ...data,
          id: `alloc-${state.allocations.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          payerBankRef: null,
          payerProofFileId: null,
          payerPaidAt: null,
          proofSubmittedAt: null,
          paymentMethod: PaymentMethod.UNKNOWN,
          deposit: { userId: state.deposit.userId, user: { id: state.deposit.userId } },
          withdrawal: { userId: state.withdrawal.userId, user: { id: state.withdrawal.userId } },
        };
        state.allocations.push(allocation);
        return allocation;
      },
      findUnique: async ({ where, include }: any) => {
        const allocation = state.allocations.find((item) => item.id === where.id);
        if (!allocation) return null;
        if (include?.withdrawal || include?.deposit) {
          return { ...allocation, withdrawal: state.withdrawal, deposit: state.deposit };
        }
        return allocation;
      },
      update: async ({ where, data }: any) => {
        const allocation = state.allocations.find((item) => item.id === where.id);
        if (!allocation) throw new Error('allocation not found');
        Object.assign(allocation, data);
        return allocation;
      },
      findMany: async ({ where }: any) => {
        if (!where) return state.allocations;
        return state.allocations.filter((allocation) => {
          if (where.status?.in && !where.status.in.includes(allocation.status)) return false;
          if (where.expiresAt?.lt && allocation.expiresAt >= where.expiresAt.lt) return false;
          return true;
        });
      },
    },
    accountReservation: {
      findFirst: async ({ where }: any) => {
        return state.accountReservations.find((r) => r.refType === where.refType && r.refId === where.refId && (!where.accountId || r.accountId === where.accountId)) ?? null;
      },
      update: async ({ where, data }: any) => {
        const reservation = state.accountReservations.find((r) => r.id === where.id);
        if (!reservation) throw new Error('reservation not found');
        reservation.amount = new Decimal(data.amount ?? reservation.amount);
        return reservation;
      },
      create: async ({ data }: any) => {
        const reservation = { ...data, id: `ar-${state.accountReservations.length + 1}` };
        state.accountReservations.push(reservation);
        return reservation;
      },
      delete: async ({ where }: any) => {
        const idx = state.accountReservations.findIndex((r) => r.id === where.id);
        if (idx >= 0) state.accountReservations.splice(idx, 1);
      },
    },
    limitReservation: {
      findMany: async ({ where }: any) => state.limitReservations.filter((r) => r.refType === where.refType && r.refId === where.refId),
      update: async ({ where, data }: any) => {
        const reservation = state.limitReservations.find((r) => r.id === where.id);
        if (!reservation) throw new Error('limit reservation not found');
        reservation.amount = new Decimal(data.amount ?? reservation.amount);
        return reservation;
      },
      create: async ({ data }: any) => {
        const reservation = { ...data, id: `lr-${state.limitReservations.length + 1}` };
        state.limitReservations.push(reservation);
        return reservation;
      },
      delete: async ({ where }: any) => {
        const idx = state.limitReservations.findIndex((r) => r.id === where.id);
        if (idx >= 0) state.limitReservations.splice(idx, 1);
      },
      findFirst: async ({ where }: any) =>
        state.limitReservations.find(
          (r) => r.refType === where.refType && r.refId === where.refId && r.usageId === where.usageId,
        ) ?? null,
    },
    p2PAssignmentIdempotency: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        state.idempotency.push(data);
        return data;
      },
    },
    attachmentLink: {
      findMany: async ({ where }: any) =>
        state.attachmentLinks.filter((link) => link.entityType === where.entityType && where.entityId.in.includes(link.entityId)),
      createMany: async ({ data }: any) => {
        state.attachmentLinks.push(...data);
      },
    },
    file: {
      findMany: async () => [],
    },
  } as any;

  return { prisma, state };
}

function makeService(prisma: any, overrides: Partial<any> = {}) {
  const accountsService = overrides.accountsService ?? {
    consumeFunds: async () => null,
    getOrCreateAccount: async (userId: string) => ({ id: `acc-${userId}` }),
    applyTransaction: async (input: any) => ({ txRecord: { id: `${input.accountId}-tx` } }),
  };
  const limitsService = overrides.limitsService ?? { consume: async () => null };
  const paymentDestinationsService = overrides.paymentDestinationsService ?? ({ buildLegacySnapshot: () => null } as PaymentDestinationsService);
  const paginationService = new PaginationService();

  return new P2PAllocationsService(
    prisma,
    paginationService,
    accountsService,
    limitsService,
    paymentDestinationsService,
  );
}

test('assignAllocations validates sum against remaining', async () => {
  const { prisma } = makeFakePrisma();
  const service = makeService(prisma);

  await assert.rejects(
    () => service.assignAllocations('wd-1', { items: [{ depositId: 'dp-1', amount: '200' }] }),
    (err: any) => err?.response?.code === 'P2P_ASSIGN_SUM_EXCEEDS_REMAINING',
  );
});

test('finalizeAllocation posts ledger changes', async () => {
  const originalMode = process.env.P2P_CONFIRMATION_MODE;
  process.env.P2P_CONFIRMATION_MODE = 'RECEIVER';
  const { prisma, state } = makeFakePrisma();
  const service = makeService(prisma, {
    paymentDestinationsService: { buildLegacySnapshot: () => null },
  });

  const allocation = await prisma.p2PAllocation.create({
    data: {
      withdrawalId: state.withdrawal.id,
      depositId: state.deposit.id,
      amount: new Decimal(10),
      status: P2PAllocationStatusEnum.RECEIVER_CONFIRMED,
      paymentCode: 'PAYCODE',
      expiresAt: new Date(Date.now() + 1000),
      destinationSnapshot: state.withdrawal.destinationSnapshot,
      receiverConfirmedAt: new Date(),
    },
  });

  try {
    const result = await service.finalizeAllocation(allocation.id, 'admin-1');
    assert.equal(result.status, P2PAllocationStatusEnum.SETTLED);
    assert.equal(state.withdrawal.settledAmountTotal.toString(), '10');
    assert.equal(state.deposit.settledAmountTotal.toString(), '10');
  } finally {
    if (originalMode === undefined) {
      delete process.env.P2P_CONFIRMATION_MODE;
    } else {
      process.env.P2P_CONFIRMATION_MODE = originalMode;
    }
  }
});

test('expireAllocations merges reservations back', async () => {
  const { prisma, state } = makeFakePrisma();
  const service = makeService(prisma);

  state.withdrawal.assignedAmountTotal = new Decimal(20);
  state.deposit.assignedAmountTotal = new Decimal(20);
  state.deposit.remainingAmount = new Decimal(30);

  const allocation = await prisma.p2PAllocation.create({
    data: {
      withdrawalId: state.withdrawal.id,
      depositId: state.deposit.id,
      amount: new Decimal(20),
      status: P2PAllocationStatusEnum.ASSIGNED,
      paymentCode: 'EXP123',
      expiresAt: new Date(Date.now() - 1000),
      destinationSnapshot: state.withdrawal.destinationSnapshot,
    },
  });

  await prisma.accountReservation.create({
    data: {
      accountId: 'acc-user-w',
      amount: new Decimal(20),
      refType: TxRefType.WITHDRAW_ALLOCATION,
      refId: allocation.id,
      status: 'RESERVED',
    },
  });

  await prisma.limitReservation.create({
    data: {
      usageId: 'usage-1',
      userId: 'user-w',
      amount: new Decimal(20),
      refType: TxRefType.WITHDRAW_ALLOCATION,
      refId: allocation.id,
      status: 'RESERVED',
    },
  });

  const processed = await service.expireAllocations();
  assert.equal(processed, 1);
  assert.equal(state.accountReservations.find((r) => r.refType === TxRefType.WITHDRAW_ALLOCATION), undefined);
  assert.equal(state.limitReservations.find((r) => r.refType === TxRefType.WITHDRAW_ALLOCATION), undefined);
});

// Ensure attachment link model shape is exercised in fake data
statefulAttachment();

function statefulAttachment() {
  void AttachmentLinkEntityType;
  void AttachmentLinkKind;
  void PaymentMethod;
}
