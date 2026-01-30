import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DepositStatus,
  P2PAllocationStatus,
  P2PConfirmationMode,
  Prisma,
  RequestPurpose,
  TxRefType,
  AccountTxType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationService } from '../../common/pagination/pagination.service';
import { AccountsService } from '../accounts/accounts.service';
import { LimitsService } from '../policy/limits.service';
import { PaymentDestinationsService } from '../payment-destinations/payment-destinations.service';
import { runInTx } from '../../common/db/tx.util';
import { addDec, dec, subDec } from '../../common/utils/decimal.util';
import { IRR_INSTRUMENT_CODE } from '../accounts/constants';
import { toUserSafeDto } from '../../common/mappers/user.mapper';
import { userSafeSelect } from '../../common/prisma/selects/user.select';
import {
  AdminP2PWithdrawalsQueryDto,
  P2PAllocationAdminViewDto,
  P2PAllocationPayerViewDto,
  P2PAllocationReceiverViewDto,
  P2PAssignRequestDto,
  P2PWithdrawalAdminListItemDto,
  P2PWithdrawalAdminStatus,
  P2PWithdrawalCandidatesItemDto,
} from './dto/p2p-allocations.dto';

const DEFAULT_TTL_MINUTES = 1440;
const P2PAllocationStatusEnum =
  (P2PAllocationStatus as any) ??
  ({
    ASSIGNED: 'ASSIGNED',
    PROOF_SUBMITTED: 'PROOF_SUBMITTED',
    RECEIVER_CONFIRMED: 'RECEIVER_CONFIRMED',
    ADMIN_VERIFIED: 'ADMIN_VERIFIED',
    SETTLED: 'SETTLED',
    DISPUTED: 'DISPUTED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
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
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
  } as const);
const P2PConfirmationModeEnum =
  (P2PConfirmationMode as any) ??
  ({
    RECEIVER: 'RECEIVER',
    ADMIN: 'ADMIN',
    BOTH: 'BOTH',
  } as const);

@Injectable()
export class P2PAllocationsService {
  private readonly logger = new Logger(P2PAllocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly accountsService: AccountsService,
    private readonly limitsService: LimitsService,
    private readonly paymentDestinationsService: PaymentDestinationsService,
  ) {}

  private getAllocationTtlMinutes(): number {
    const value = Number(process.env.P2P_ALLOCATION_TTL_MINUTES ?? DEFAULT_TTL_MINUTES);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_TTL_MINUTES;
  }

  private getConfirmationMode(): P2PConfirmationMode {
    const raw = String(process.env.P2P_CONFIRMATION_MODE ?? 'RECEIVER').toUpperCase();
    if (raw === 'ADMIN') return P2PConfirmationModeEnum.ADMIN;
    if (raw === 'BOTH') return P2PConfirmationModeEnum.BOTH;
    return P2PConfirmationModeEnum.RECEIVER;
  }

  private resolveWithdrawalStatus(withdrawal: {
    amount: Decimal;
    assignedAmountTotal: Decimal;
    settledAmountTotal: Decimal;
  }): P2PWithdrawalAdminStatus {
    if (dec(withdrawal.settledAmountTotal).gte(withdrawal.amount)) {
      return P2PWithdrawalAdminStatus.SETTLED;
    }
    if (dec(withdrawal.assignedAmountTotal).gt(0)) {
      return P2PWithdrawalAdminStatus.PARTIAL;
    }
    return P2PWithdrawalAdminStatus.WAITING_MATCH;
  }

  private async lockWithdrawRow(tx: Prisma.TransactionClient, withdrawalId: string) {
    await tx.$queryRaw`
      SELECT id FROM "WithdrawRequest" WHERE id = ${withdrawalId} FOR UPDATE
    `;
  }

  private async lockDepositRows(tx: Prisma.TransactionClient, ids: string[]) {
    if (ids.length === 0) return;
    await tx.$queryRaw`
      SELECT id FROM "DepositRequest" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE
    `;
  }

  private async lockAllocationRow(tx: Prisma.TransactionClient, allocationId: string) {
    await tx.$queryRaw`
      SELECT id FROM "P2PAllocation" WHERE id = ${allocationId} FOR UPDATE
    `;
  }

  private ensureFinalizable(allocation: {
    status: P2PAllocationStatus;
    receiverConfirmedAt: Date | null;
    adminVerifiedAt: Date | null;
  }) {
    const mode = this.getConfirmationMode();
    if (mode === P2PConfirmationModeEnum.RECEIVER) {
      if (allocation.status !== P2PAllocationStatusEnum.RECEIVER_CONFIRMED) {
        throw new BadRequestException({
          code: 'P2P_ALLOCATION_NOT_FINALIZABLE',
          message: 'Allocation is not confirmed by receiver yet.',
        });
      }
    } else if (mode === P2PConfirmationModeEnum.ADMIN) {
      if (allocation.status !== P2PAllocationStatusEnum.ADMIN_VERIFIED) {
        throw new BadRequestException({
          code: 'P2P_ALLOCATION_NOT_FINALIZABLE',
          message: 'Allocation is not verified by admin yet.',
        });
      }
    } else {
      if (!allocation.receiverConfirmedAt || !allocation.adminVerifiedAt) {
        throw new BadRequestException({
          code: 'P2P_ALLOCATION_NOT_FINALIZABLE',
          message: 'Allocation requires both receiver and admin confirmation.',
        });
      }
    }
  }

  private allocationExpired(allocation: { expiresAt: Date }): boolean {
    return allocation.expiresAt.getTime() <= Date.now();
  }

  private generatePaymentCode(): string {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
  }

  async listAdminWithdrawals(query: AdminP2PWithdrawalsQueryDto) {
    const { skip, take, page, limit } = this.paginationService.getSkipTake(query.page, query.limit);

    const baseWhere: Prisma.WithdrawRequestWhereInput = {
      purpose: RequestPurposeEnum.P2P,
    };

    let withdrawals = await this.prisma.withdrawRequest.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        assignedAmountTotal: true,
        settledAmountTotal: true,
        destinationSnapshot: true,
        bankName: true,
        iban: true,
        cardNumber: true,
        createdAt: true,
        user: { select: userSafeSelect },
      },
    });

    let mapped = withdrawals.map((withdrawal) => {
      const status = this.resolveWithdrawalStatus({
        amount: withdrawal.amount,
        assignedAmountTotal: withdrawal.assignedAmountTotal,
        settledAmountTotal: withdrawal.settledAmountTotal,
      });
      const remainingToAssign = subDec(withdrawal.amount, withdrawal.assignedAmountTotal);
      const remainingToSettle = subDec(withdrawal.amount, withdrawal.settledAmountTotal);
      const snapshot = withdrawal.destinationSnapshot as { maskedValue?: string } | null;
      const destinationMasked = snapshot?.maskedValue
        ?? (withdrawal.iban ? `****${withdrawal.iban.slice(-4)}` : withdrawal.cardNumber ? `****${withdrawal.cardNumber.slice(-4)}` : null);

      return {
        id: withdrawal.id,
        userSummary: toUserSafeDto(withdrawal.user),
        amount: withdrawal.amount.toString(),
        assignedTotal: withdrawal.assignedAmountTotal.toString(),
        settledTotal: withdrawal.settledAmountTotal.toString(),
        remainingToAssign: remainingToAssign.toString(),
        remainingToSettle: remainingToSettle.toString(),
        destinationMasked,
        status,
        createdAt: withdrawal.createdAt,
      } satisfies P2PWithdrawalAdminListItemDto;
    });

    if (query.status) {
      mapped = mapped.filter((item) => item.status === query.status);
    }

    const total = mapped.length;
    const items = mapped.slice(skip, skip + take);

    return this.paginationService.wrap(items, total, page, limit);
  }

  async listCandidates(withdrawalId: string): Promise<P2PWithdrawalCandidatesItemDto[]> {
    const withdrawal = await this.prisma.withdrawRequest.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) throw new NotFoundException('Withdraw not found');
    if (withdrawal.purpose !== RequestPurposeEnum.P2P) {
      throw new BadRequestException({ code: 'P2P_FORBIDDEN', message: 'Withdrawal is not P2P.' });
    }

    const deposits = await this.prisma.depositRequest.findMany({
      where: {
        purpose: RequestPurposeEnum.P2P,
        remainingAmount: { gt: new Decimal(0) },
        status: { in: [DepositStatusEnum.PENDING, DepositStatusEnum.APPROVED] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        amount: true,
        remainingAmount: true,
        status: true,
        createdAt: true,
        user: { select: userSafeSelect },
      },
    });

    return deposits.map((deposit) => ({
      id: deposit.id,
      userSummary: toUserSafeDto(deposit.user),
      requestedAmount: deposit.amount.toString(),
      remainingAmount: dec(deposit.remainingAmount).toString(),
      status: deposit.status,
      createdAt: deposit.createdAt,
    }));
  }

  async assignAllocations(
    withdrawalId: string,
    dto: P2PAssignRequestDto,
    idempotencyKey?: string,
  ): Promise<P2PAllocationAdminViewDto[]> {
    if (!dto.items?.length) {
      throw new BadRequestException({ code: 'P2P_ASSIGN_INVALID', message: 'No allocation items provided.' });
    }

    const amounts = dto.items.map((item) => new Decimal(item.amount));
    if (amounts.some((amount) => amount.lte(0))) {
      throw new BadRequestException({ code: 'P2P_ASSIGN_INVALID', message: 'Allocation amounts must be positive.' });
    }

    return runInTx(
      this.prisma,
      async (tx) => {
        if (idempotencyKey) {
          const existing = await tx.p2PAssignmentIdempotency.findUnique({
            where: { key_withdrawalId: { key: idempotencyKey, withdrawalId } },
          });
          if (existing) {
            return existing.responseJson as P2PAllocationAdminViewDto[];
          }
        }

        await this.lockWithdrawRow(tx, withdrawalId);
        const withdrawal = await tx.withdrawRequest.findUnique({ where: { id: withdrawalId } });
        if (!withdrawal) throw new NotFoundException('Withdraw not found');
        if (withdrawal.purpose !== RequestPurposeEnum.P2P) {
          throw new BadRequestException({ code: 'P2P_FORBIDDEN', message: 'Withdrawal is not P2P.' });
        }

        const depositIds = dto.items.map((item) => item.depositId);
        await this.lockDepositRows(tx, depositIds);
        const deposits = await tx.depositRequest.findMany({ where: { id: { in: depositIds } } });

        const depositMap = new Map(deposits.map((deposit) => [deposit.id, deposit] as const));
        const totalAssign = amounts.reduce((sum, amount) => sum.add(amount), new Decimal(0));
        const remainingToAssign = subDec(withdrawal.amount, withdrawal.assignedAmountTotal);

        if (totalAssign.gt(remainingToAssign)) {
          throw new BadRequestException({
            code: 'P2P_ASSIGN_SUM_EXCEEDS_REMAINING',
            message: 'Assigned amount exceeds remaining withdrawal capacity.',
          });
        }

        const destinationSnapshot = withdrawal.destinationSnapshot
          ?? this.paymentDestinationsService.buildLegacySnapshot({
              iban: withdrawal.iban,
              cardNumber: withdrawal.cardNumber,
              bankName: withdrawal.bankName,
            });
        if (!destinationSnapshot) {
          throw new BadRequestException({
            code: 'P2P_WITHDRAWAL_MISSING_DESTINATION',
            message: 'Withdrawal destination is missing.',
          });
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.getAllocationTtlMinutes() * 60_000);
        const allocations: P2PAllocationAdminViewDto[] = [];
        let withdrawalAssignedTotal = dec(withdrawal.assignedAmountTotal);
        const depositState = new Map(
          deposits.map((deposit) => [
            deposit.id,
            {
              assignedTotal: dec(deposit.assignedAmountTotal),
              remaining: dec(deposit.remainingAmount ?? deposit.amount),
            },
          ] as const),
        );

        for (let idx = 0; idx < dto.items.length; idx += 1) {
          const item = dto.items[idx];
          const deposit = depositMap.get(item.depositId);
          if (!deposit) {
            throw new NotFoundException(`Deposit ${item.depositId} not found`);
          }
          if (deposit.purpose !== RequestPurposeEnum.P2P) {
            throw new BadRequestException({ code: 'P2P_FORBIDDEN', message: 'Deposit is not P2P.' });
          }
          const state = depositState.get(deposit.id)!;
          const remaining = state.remaining;
          const amount = amounts[idx];
          if (amount.gt(remaining)) {
            throw new BadRequestException({
              code: 'P2P_ASSIGN_AMOUNT_EXCEEDS_DEPOSIT_REMAINING',
              message: 'Assigned amount exceeds deposit remaining amount.',
            });
          }

          const allocation = await tx.p2PAllocation.create({
            data: {
              withdrawalId: withdrawal.id,
              depositId: deposit.id,
              amount,
              status: P2PAllocationStatusEnum.ASSIGNED,
              paymentCode: this.generatePaymentCode(),
              expiresAt,
              destinationSnapshot: destinationSnapshot as any,
            },
          });

          await this.splitReservationForAllocation(tx, withdrawal, allocation.id, amount);

          withdrawalAssignedTotal = withdrawalAssignedTotal.add(amount);
          state.assignedTotal = state.assignedTotal.add(amount);
          state.remaining = state.remaining.sub(amount);

          await tx.withdrawRequest.update({
            where: { id: withdrawal.id },
            data: { assignedAmountTotal: withdrawalAssignedTotal },
          });

          await tx.depositRequest.update({
            where: { id: deposit.id },
            data: {
              assignedAmountTotal: state.assignedTotal,
              remainingAmount: state.remaining,
            },
          });

          allocations.push({
            id: allocation.id,
            withdrawalId: allocation.withdrawalId,
            depositId: allocation.depositId,
            amount: allocation.amount.toString(),
            status: allocation.status,
            paymentCode: allocation.paymentCode,
            expiresAt: allocation.expiresAt,
            destinationSnapshot: allocation.destinationSnapshot as Record<string, any>,
            payerBankRef: allocation.payerBankRef ?? null,
            payerProofFileId: allocation.payerProofFileId ?? null,
            payerPaidAt: allocation.payerPaidAt ?? null,
            createdAt: allocation.createdAt,
          });
        }

        if (idempotencyKey) {
          await tx.p2PAssignmentIdempotency.create({
            data: {
              key: idempotencyKey,
              withdrawalId,
              responseJson: allocations as any,
            },
          });
        }

        return allocations;
      },
      { logger: this.logger },
    );
  }

  async listMyAllocationsAsPayer(userId: string, status?: P2PAllocationStatus): Promise<P2PAllocationPayerViewDto[]> {
    const allocations = await this.prisma.p2PAllocation.findMany({
      where: {
        status,
        deposit: { userId },
      },
      orderBy: { createdAt: 'desc' },
      include: { deposit: true },
    });

    return allocations.map((allocation) => ({
      id: allocation.id,
      amount: allocation.amount.toString(),
      status: allocation.status,
      expiresAt: allocation.expiresAt,
      paymentCode: allocation.paymentCode,
      destinationToPay: allocation.destinationSnapshot as Record<string, any>,
      withdrawalRef: allocation.withdrawalId,
      createdAt: allocation.createdAt,
    }));
  }

  async submitPayerProof(
    allocationId: string,
    userId: string,
    params: { bankRef: string; proofFileId?: string; paidAt?: string },
  ): Promise<P2PAllocationPayerViewDto> {
    return runInTx(this.prisma, async (tx) => {
      await this.lockAllocationRow(tx, allocationId);
      const allocation = await tx.p2PAllocation.findUnique({ where: { id: allocationId }, include: { deposit: true } });
      if (!allocation) throw new NotFoundException('Allocation not found');
      if (allocation.deposit.userId !== userId) {
        throw new ForbiddenException({ code: 'P2P_FORBIDDEN', message: 'Forbidden' });
      }

      if (allocation.status !== P2PAllocationStatusEnum.ASSIGNED) {
        throw new BadRequestException('Allocation is not assignable');
      }

      if (this.allocationExpired(allocation)) {
        throw new BadRequestException({ code: 'P2P_ALLOCATION_EXPIRED', message: 'Allocation expired.' });
      }

      const updated = await tx.p2PAllocation.update({
        where: { id: allocation.id },
        data: {
          status: P2PAllocationStatusEnum.PROOF_SUBMITTED,
          payerBankRef: params.bankRef,
          payerProofFileId: params.proofFileId ?? allocation.payerProofFileId,
          payerPaidAt: params.paidAt ? new Date(params.paidAt) : allocation.payerPaidAt ?? new Date(),
        },
      });

      return {
        id: updated.id,
        amount: updated.amount.toString(),
        status: updated.status,
        expiresAt: updated.expiresAt,
        paymentCode: updated.paymentCode,
        destinationToPay: updated.destinationSnapshot as Record<string, any>,
        withdrawalRef: updated.withdrawalId,
        createdAt: updated.createdAt,
      };
    });
  }

  async listMyAllocationsAsReceiver(userId: string, status?: P2PAllocationStatus): Promise<P2PAllocationReceiverViewDto[]> {
    const allocations = await this.prisma.p2PAllocation.findMany({
      where: {
        status,
        withdrawal: { userId },
      },
      orderBy: { createdAt: 'desc' },
      include: { deposit: { include: { user: true } } },
    });

    return allocations.map((allocation) => ({
      id: allocation.id,
      amount: allocation.amount.toString(),
      status: allocation.status,
      payerSummary: toUserSafeDto(allocation.deposit.user),
      bankRef: allocation.payerBankRef ?? null,
      proofFileId: allocation.payerProofFileId ?? null,
      paidAt: allocation.payerPaidAt ?? null,
      paymentCode: allocation.paymentCode,
      createdAt: allocation.createdAt,
    }));
  }

  async receiverConfirm(
    allocationId: string,
    userId: string,
    params: { confirmed: boolean; reason?: string },
  ): Promise<P2PAllocationReceiverViewDto> {
    return runInTx(this.prisma, async (tx) => {
      await this.lockAllocationRow(tx, allocationId);
      const allocation = await tx.p2PAllocation.findUnique({
        where: { id: allocationId },
        include: { withdrawal: true, deposit: { include: { user: true } } },
      });
      if (!allocation) throw new NotFoundException('Allocation not found');
      if (allocation.withdrawal.userId !== userId) {
        throw new ForbiddenException({ code: 'P2P_FORBIDDEN', message: 'Forbidden' });
      }

      if (![
        P2PAllocationStatusEnum.PROOF_SUBMITTED,
        P2PAllocationStatusEnum.ADMIN_VERIFIED,
      ].includes(allocation.status)) {
        throw new BadRequestException('Allocation is not awaiting confirmation');
      }

      const updateData = params.confirmed
        ? {
            status:
              allocation.status === P2PAllocationStatusEnum.ADMIN_VERIFIED
                ? allocation.status
                : P2PAllocationStatusEnum.RECEIVER_CONFIRMED,
            receiverConfirmedAt: new Date(),
          }
        : {
            status: P2PAllocationStatusEnum.DISPUTED,
            receiverDisputedAt: new Date(),
            receiverDisputeReason: params.reason ?? 'Receiver disputed payment',
          };

      const updated = await tx.p2PAllocation.update({
        where: { id: allocation.id },
        data: updateData,
      });

      return {
        id: updated.id,
        amount: updated.amount.toString(),
        status: updated.status,
        payerSummary: toUserSafeDto(allocation.deposit.user),
        bankRef: updated.payerBankRef ?? null,
        proofFileId: updated.payerProofFileId ?? null,
        paidAt: updated.payerPaidAt ?? null,
        paymentCode: updated.paymentCode,
        createdAt: updated.createdAt,
      };
    });
  }

  async adminVerify(allocationId: string, adminId: string, approved: boolean): Promise<P2PAllocationAdminViewDto> {
    return runInTx(this.prisma, async (tx) => {
      await this.lockAllocationRow(tx, allocationId);
      const allocation = await tx.p2PAllocation.findUnique({ where: { id: allocationId } });
      if (!allocation) throw new NotFoundException('Allocation not found');

      if (![
        P2PAllocationStatusEnum.PROOF_SUBMITTED,
        P2PAllocationStatusEnum.RECEIVER_CONFIRMED,
      ].includes(allocation.status)) {
        throw new BadRequestException('Allocation is not awaiting verification');
      }

      const updateData = approved
        ? {
            status: P2PAllocationStatusEnum.ADMIN_VERIFIED,
            adminVerifiedAt: new Date(),
            adminVerifierId: adminId,
          }
        : {
            status: P2PAllocationStatusEnum.DISPUTED,
            adminVerifiedAt: new Date(),
            adminVerifierId: adminId,
          };

      const updated = await tx.p2PAllocation.update({ where: { id: allocationId }, data: updateData });

      return {
        id: updated.id,
        withdrawalId: updated.withdrawalId,
        depositId: updated.depositId,
        amount: updated.amount.toString(),
        status: updated.status,
        paymentCode: updated.paymentCode,
        expiresAt: updated.expiresAt,
        destinationSnapshot: updated.destinationSnapshot as Record<string, any>,
        payerBankRef: updated.payerBankRef ?? null,
        payerProofFileId: updated.payerProofFileId ?? null,
        payerPaidAt: updated.payerPaidAt ?? null,
        createdAt: updated.createdAt,
      };
    });
  }

  async finalizeAllocation(allocationId: string, adminId: string): Promise<P2PAllocationAdminViewDto> {
    return runInTx(this.prisma, async (tx) => {
      await this.lockAllocationRow(tx, allocationId);
      const allocation = await tx.p2PAllocation.findUnique({
        where: { id: allocationId },
        include: { withdrawal: true, deposit: true },
      });
      if (!allocation) throw new NotFoundException('Allocation not found');
      await this.lockWithdrawRow(tx, allocation.withdrawalId);
      await this.lockDepositRows(tx, [allocation.depositId]);
      if (allocation.status === P2PAllocationStatusEnum.SETTLED) {
        return {
          id: allocation.id,
          withdrawalId: allocation.withdrawalId,
          depositId: allocation.depositId,
          amount: allocation.amount.toString(),
          status: allocation.status,
          paymentCode: allocation.paymentCode,
          expiresAt: allocation.expiresAt,
          destinationSnapshot: allocation.destinationSnapshot as Record<string, any>,
          payerBankRef: allocation.payerBankRef ?? null,
          payerProofFileId: allocation.payerProofFileId ?? null,
          payerPaidAt: allocation.payerPaidAt ?? null,
          createdAt: allocation.createdAt,
        };
      }

      if (
        [
          P2PAllocationStatusEnum.CANCELLED,
          P2PAllocationStatusEnum.EXPIRED,
          P2PAllocationStatusEnum.DISPUTED,
        ].includes(allocation.status)
      ) {
        throw new BadRequestException('Allocation cannot be finalized');
      }

      if (this.allocationExpired(allocation)) {
        throw new BadRequestException({ code: 'P2P_ALLOCATION_EXPIRED', message: 'Allocation expired.' });
      }

      this.ensureFinalizable(allocation);

      await this.accountsService.consumeFunds({
        userId: allocation.withdrawal.userId,
        instrumentCode: IRR_INSTRUMENT_CODE,
        refType: TxRefType.WITHDRAW_ALLOCATION,
        refId: allocation.id,
        tx,
      });

      await this.limitsService.consume({ refType: TxRefType.WITHDRAW_ALLOCATION, refId: allocation.id }, tx);

      const withdrawerAccount = await this.accountsService.getOrCreateAccount(
        allocation.withdrawal.userId,
        IRR_INSTRUMENT_CODE,
        tx,
      );
      const payerAccount = await this.accountsService.getOrCreateAccount(
        allocation.deposit.userId,
        IRR_INSTRUMENT_CODE,
        tx,
      );

      const debitTx = await this.accountsService.applyTransaction(
        {
          accountId: withdrawerAccount.id,
          delta: new Decimal(allocation.amount).negated(),
          type: AccountTxType.REMITTANCE,
          refType: TxRefType.WITHDRAW_ALLOCATION,
          refId: allocation.id,
          createdById: adminId,
        },
        tx,
      );

      const creditTx = await this.accountsService.applyTransaction(
        {
          accountId: payerAccount.id,
          delta: allocation.amount,
          type: AccountTxType.REMITTANCE,
          refType: TxRefType.WITHDRAW_ALLOCATION,
          refId: allocation.id,
          createdById: adminId,
        },
        tx,
      );

      const updated = await tx.p2PAllocation.update({
        where: { id: allocation.id },
        data: {
          status: P2PAllocationStatusEnum.SETTLED,
          settledAt: new Date(),
          withdrawerAccountTxId: debitTx.txRecord.id,
          payerAccountTxId: creditTx.txRecord.id,
        },
      });

      await tx.withdrawRequest.update({
        where: { id: allocation.withdrawalId },
        data: { settledAmountTotal: addDec(allocation.withdrawal.settledAmountTotal, allocation.amount) },
      });

      await tx.depositRequest.update({
        where: { id: allocation.depositId },
        data: { settledAmountTotal: addDec(allocation.deposit.settledAmountTotal, allocation.amount) },
      });

      return {
        id: updated.id,
        withdrawalId: updated.withdrawalId,
        depositId: updated.depositId,
        amount: updated.amount.toString(),
        status: updated.status,
        paymentCode: updated.paymentCode,
        expiresAt: updated.expiresAt,
        destinationSnapshot: updated.destinationSnapshot as Record<string, any>,
        payerBankRef: updated.payerBankRef ?? null,
        payerProofFileId: updated.payerProofFileId ?? null,
        payerPaidAt: updated.payerPaidAt ?? null,
        createdAt: updated.createdAt,
      };
    });
  }

  async cancelAllocation(allocationId: string): Promise<P2PAllocationAdminViewDto> {
    return runInTx(this.prisma, async (tx) => {
      await this.lockAllocationRow(tx, allocationId);
      const allocation = await tx.p2PAllocation.findUnique({
        where: { id: allocationId },
        include: { withdrawal: true, deposit: true },
      });
      if (!allocation) throw new NotFoundException('Allocation not found');
      await this.lockWithdrawRow(tx, allocation.withdrawalId);
      await this.lockDepositRows(tx, [allocation.depositId]);
      if (allocation.status === P2PAllocationStatusEnum.SETTLED) {
        throw new BadRequestException('Allocation already settled');
      }

      await this.mergeReservationBack(tx, allocation);

      const updated = await tx.p2PAllocation.update({
        where: { id: allocationId },
        data: { status: P2PAllocationStatusEnum.CANCELLED },
      });

      await tx.withdrawRequest.update({
        where: { id: allocation.withdrawalId },
        data: { assignedAmountTotal: subDec(allocation.withdrawal.assignedAmountTotal, allocation.amount) },
      });

      await tx.depositRequest.update({
        where: { id: allocation.depositId },
        data: {
          assignedAmountTotal: subDec(allocation.deposit.assignedAmountTotal, allocation.amount),
          remainingAmount: addDec(allocation.deposit.remainingAmount ?? allocation.deposit.amount, allocation.amount),
        },
      });

      return {
        id: updated.id,
        withdrawalId: updated.withdrawalId,
        depositId: updated.depositId,
        amount: updated.amount.toString(),
        status: updated.status,
        paymentCode: updated.paymentCode,
        expiresAt: updated.expiresAt,
        destinationSnapshot: updated.destinationSnapshot as Record<string, any>,
        payerBankRef: updated.payerBankRef ?? null,
        payerProofFileId: updated.payerProofFileId ?? null,
        payerPaidAt: updated.payerPaidAt ?? null,
        createdAt: updated.createdAt,
      };
    });
  }

  async expireAllocations(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.p2PAllocation.findMany({
      where: {
        expiresAt: { lt: now },
        status: { in: [P2PAllocationStatusEnum.ASSIGNED, P2PAllocationStatusEnum.PROOF_SUBMITTED] },
      },
      select: { id: true },
    });

    if (expired.length === 0) return 0;

    let processed = 0;
    for (const { id } of expired) {
      await runInTx(this.prisma, async (tx) => {
        await this.lockAllocationRow(tx, id);
        const allocation = await tx.p2PAllocation.findUnique({
          where: { id },
          include: { withdrawal: true, deposit: true },
        });
        if (!allocation) return;
        await this.lockWithdrawRow(tx, allocation.withdrawalId);
        await this.lockDepositRows(tx, [allocation.depositId]);
        if (![
          P2PAllocationStatusEnum.ASSIGNED,
          P2PAllocationStatusEnum.PROOF_SUBMITTED,
        ].includes(allocation.status)) {
          return;
        }

        await this.mergeReservationBack(tx, allocation);

        await tx.p2PAllocation.update({ where: { id }, data: { status: P2PAllocationStatusEnum.EXPIRED } });
        await tx.withdrawRequest.update({
          where: { id: allocation.withdrawalId },
          data: { assignedAmountTotal: subDec(allocation.withdrawal.assignedAmountTotal, allocation.amount) },
        });
        await tx.depositRequest.update({
          where: { id: allocation.depositId },
          data: {
            assignedAmountTotal: subDec(allocation.deposit.assignedAmountTotal, allocation.amount),
            remainingAmount: addDec(allocation.deposit.remainingAmount ?? allocation.deposit.amount, allocation.amount),
          },
        });

        processed += 1;
      });
    }

    return processed;
  }

  private async splitReservationForAllocation(
    tx: Prisma.TransactionClient,
    withdrawal: { id: string; userId: string },
    allocationId: string,
    amount: Decimal,
  ) {
    const accountReservation = await tx.accountReservation.findFirst({
      where: { refType: TxRefType.WITHDRAW, refId: withdrawal.id },
    });
    if (!accountReservation) {
      throw new BadRequestException('Withdrawal reservation not found');
    }
    if (dec(accountReservation.amount).lt(amount)) {
      throw new BadRequestException('Withdrawal reservation insufficient');
    }

    await tx.accountReservation.update({
      where: { id: accountReservation.id },
      data: { amount: subDec(accountReservation.amount, amount) },
    });

    await tx.accountReservation.create({
      data: {
        accountId: accountReservation.accountId,
        amount,
        refType: TxRefType.WITHDRAW_ALLOCATION,
        refId: allocationId,
        status: accountReservation.status,
      },
    });

    const limitReservations = await tx.limitReservation.findMany({
      where: { refType: TxRefType.WITHDRAW, refId: withdrawal.id },
    });

    for (const reservation of limitReservations) {
      await tx.limitReservation.update({
        where: { id: reservation.id },
        data: { amount: subDec(reservation.amount, amount) },
      });

      await tx.limitReservation.create({
        data: {
          usageId: reservation.usageId,
          userId: reservation.userId,
          amount,
          refType: TxRefType.WITHDRAW_ALLOCATION,
          refId: allocationId,
          status: reservation.status,
        },
      });
    }
  }

  private async mergeReservationBack(
    tx: Prisma.TransactionClient,
    allocation: { id: string; amount: Decimal; withdrawalId: string },
  ) {
    const allocationReservation = await tx.accountReservation.findFirst({
      where: { refType: TxRefType.WITHDRAW_ALLOCATION, refId: allocation.id },
    });
    if (allocationReservation) {
      const originalReservation = await tx.accountReservation.findFirst({
        where: { refType: TxRefType.WITHDRAW, refId: allocation.withdrawalId, accountId: allocationReservation.accountId },
      });
      if (originalReservation) {
        await tx.accountReservation.update({
          where: { id: originalReservation.id },
          data: { amount: addDec(originalReservation.amount, allocation.amount) },
        });
      }
      await tx.accountReservation.delete({ where: { id: allocationReservation.id } });
    }

    const allocationLimitReservations = await tx.limitReservation.findMany({
      where: { refType: TxRefType.WITHDRAW_ALLOCATION, refId: allocation.id },
    });
    for (const reservation of allocationLimitReservations) {
      const original = await tx.limitReservation.findFirst({
        where: {
          refType: TxRefType.WITHDRAW,
          refId: allocation.withdrawalId,
          usageId: reservation.usageId,
        },
      });
      if (original) {
        await tx.limitReservation.update({
          where: { id: original.id },
          data: { amount: addDec(original.amount, allocation.amount) },
        });
      }
      await tx.limitReservation.delete({ where: { id: reservation.id } });
    }
  }
}
