import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DepositStatus,
  PaymentDestinationType,
  PaymentMethod,
  P2PAllocationStatus,
  P2PConfirmationMode,
  Prisma,
  RequestPurpose,
  TxRefType,
  AccountTxType,
  WithdrawStatus,
  WithdrawalChannel,
  AttachmentLinkKind,
  AttachmentLinkEntityType,
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
import {
  AdminP2PAllocationsQueryDto,
  AdminP2PWithdrawalCandidatesQueryDto,
  AdminP2PWithdrawalsQueryDto,
  AllocationAttachmentDto,
  AllocationDestinationDto,
  AllocationVmDto,
  DepositVmDto,
  P2PAllocationQueryDto,
  P2PAllocationProofDto,
  P2PAllocationSort,
  P2PCandidateSort,
  P2PListMetaDto,
  P2PListResponseDto,
  P2PWithdrawalListSort,
  WithdrawalVmDto,
} from './dto/p2p-allocations.dto';
import { deriveDepositP2PStatus, deriveWithdrawP2PStatus } from './p2p-status.util';
import { maskDestinationValue } from '../payment-destinations/payment-destinations.crypto';

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
    WAITING_ASSIGNMENT: 'WAITING_ASSIGNMENT',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
    SETTLED: 'SETTLED',
  } as const);
const WithdrawStatusEnum =
  (WithdrawStatus as any) ??
  ({
    WAITING_ASSIGNMENT: 'WAITING_ASSIGNMENT',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
    SETTLED: 'SETTLED',
  } as const);
const P2PConfirmationModeEnum =
  (P2PConfirmationMode as any) ??
  ({
    RECEIVER: 'RECEIVER',
    ADMIN: 'ADMIN',
    BOTH: 'BOTH',
  } as const);
const PaymentMethodEnum =
  (PaymentMethod as any) ??
  ({
    CARD_TO_CARD: 'CARD_TO_CARD',
    SATNA: 'SATNA',
    PAYA: 'PAYA',
    TRANSFER: 'TRANSFER',
    UNKNOWN: 'UNKNOWN',
  } as const);
const PaymentDestinationTypeEnum =
  (PaymentDestinationType as any) ??
  ({
    IBAN: 'IBAN',
    CARD: 'CARD',
    ACCOUNT: 'ACCOUNT',
  } as const);
const WithdrawalChannelEnum =
  (WithdrawalChannel as any) ??
  ({
    USER_TO_USER: 'USER_TO_USER',
    USER_TO_ORG: 'USER_TO_ORG',
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

  private isFinalizable(allocation: {
    status: P2PAllocationStatus;
    receiverConfirmedAt: Date | null;
    adminVerifiedAt: Date | null;
  }): boolean {
    try {
      this.ensureFinalizable(allocation);
      return true;
    } catch {
      return false;
    }
  }

  private allocationExpired(allocation: { expiresAt: Date }): boolean {
    return allocation.expiresAt.getTime() <= Date.now();
  }

  private generatePaymentCode(): string {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
  }

  private parseStatusFilter(status?: string): string[] | undefined {
    if (!status) return undefined;
    const values = status
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length ? values : undefined;
  }

  private buildListMeta(params: {
    limit: number;
    sort?: string;
    total?: number;
    filtersApplied?: Record<string, any>;
  }): P2PListMetaDto {
    return {
      total: params.total,
      nextCursor: null,
      limit: params.limit,
      sort: params.sort,
      filtersApplied: params.filtersApplied,
    };
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

  private buildWithdrawalVm(withdrawal: {
    id: string;
    purpose: RequestPurpose;
    channel: WithdrawalChannel | null;
    amount: Decimal;
    status: WithdrawStatus;
    assignedAmountTotal: Decimal;
    settledAmountTotal: Decimal;
    destinationSnapshot: any;
    bankName: string | null;
    iban: string | null;
    cardNumber: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): WithdrawalVmDto {
    const remainingToAssign = subDec(withdrawal.amount, withdrawal.assignedAmountTotal);
    const remainingToSettle = subDec(withdrawal.amount, withdrawal.settledAmountTotal);
    const destinationSnapshot = withdrawal.destinationSnapshot as { maskedValue?: string; type?: PaymentDestinationType } | null;
    const masked = destinationSnapshot?.maskedValue
      ?? (withdrawal.iban ? maskDestinationValue(withdrawal.iban) : withdrawal.cardNumber ? maskDestinationValue(withdrawal.cardNumber) : null);

    const status = withdrawal.status;
    const closed = [WithdrawStatusEnum.CANCELLED, WithdrawStatusEnum.EXPIRED, WithdrawStatusEnum.SETTLED].includes(status);
    const canAssign = remainingToAssign.gt(0) && !closed;
    const canCancel = withdrawal.settledAmountTotal.eq(0) && !closed;

    return {
      id: withdrawal.id,
      purpose: withdrawal.purpose,
      channel: withdrawal.channel ?? null,
      amount: withdrawal.amount.toString(),
      status: withdrawal.status,
      totals: {
        assigned: withdrawal.assignedAmountTotal.toString(),
        settled: withdrawal.settledAmountTotal.toString(),
        remainingToAssign: remainingToAssign.toString(),
        remainingToSettle: remainingToSettle.toString(),
      },
      destination: masked
        ? {
            type: destinationSnapshot?.type ?? (withdrawal.iban ? PaymentDestinationTypeEnum.IBAN : PaymentDestinationTypeEnum.CARD),
            masked,
            bankName: withdrawal.bankName ?? null,
            title: null,
          }
        : null,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
      actions: {
        canCancel,
        canAssign,
        canViewAllocations: true,
      },
    };
  }

  private buildDepositVm(deposit: {
    id: string;
    purpose: RequestPurpose;
    amount: Decimal;
    remainingAmount: Decimal | null;
    assignedAmountTotal: Decimal;
    settledAmountTotal: Decimal;
    status: DepositStatus;
    createdAt: Date;
    updatedAt: Date;
  }): DepositVmDto {
    const remaining = dec(deposit.remainingAmount ?? deposit.amount);
    const closed = [DepositStatusEnum.CANCELLED, DepositStatusEnum.EXPIRED, DepositStatusEnum.SETTLED].includes(deposit.status);

    return {
      id: deposit.id,
      purpose: deposit.purpose,
      requestedAmount: deposit.amount.toString(),
      status: deposit.status,
      totals: {
        assigned: deposit.assignedAmountTotal.toString(),
        settled: deposit.settledAmountTotal.toString(),
        remaining: remaining.toString(),
      },
      createdAt: deposit.createdAt,
      updatedAt: deposit.updatedAt,
      actions: {
        canCancel: deposit.settledAmountTotal.eq(0) && !closed,
        canBeAssigned: remaining.gt(0) && !closed,
      },
    };
  }

  private buildAllocationVm(params: {
    allocation: any;
    attachments: AllocationAttachmentDto[];
    includeDestination: boolean;
  }): AllocationVmDto {
    const { allocation, attachments, includeDestination } = params;
    const snapshot = allocation.destinationSnapshot as {
      type: PaymentDestinationType;
      value?: string;
      maskedValue?: string;
      bankName?: string | null;
      ownerName?: string | null;
    };

    const destination: AllocationDestinationDto | null = includeDestination
      ? {
          type: snapshot.type,
          bankName: snapshot.bankName ?? null,
          ownerName: snapshot.ownerName ?? null,
          fullValue: snapshot.value ?? '',
          masked: snapshot.maskedValue ?? maskDestinationValue(snapshot.value ?? ''),
        }
      : null;

    const expired = this.allocationExpired(allocation);
    const adminCanFinalize = this.isFinalizable(allocation) && !expired && allocation.status !== P2PAllocationStatusEnum.SETTLED;

    return {
      id: allocation.id,
      withdrawalId: allocation.withdrawalId,
      depositId: allocation.depositId,
      payer: {
        userId: allocation.deposit.userId,
        mobile: allocation.deposit.user?.mobile ?? null,
        displayName: allocation.deposit.user?.fullName ?? null,
      },
      receiver: {
        userId: allocation.withdrawal.userId,
        mobile: allocation.withdrawal.user?.mobile ?? null,
        displayName: allocation.withdrawal.user?.fullName ?? null,
      },
      amount: allocation.amount.toString(),
      status: allocation.status,
      expiresAt: allocation.expiresAt,
      paymentCode: allocation.paymentCode,
      payment: {
        method: allocation.paymentMethod ?? PaymentMethodEnum.UNKNOWN,
        bankRef: allocation.payerBankRef ?? null,
        paidAt: allocation.payerPaidAt ?? null,
      },
      attachments,
      destinationToPay: destination,
      timestamps: {
        proofSubmittedAt: allocation.proofSubmittedAt ?? null,
        receiverConfirmedAt: allocation.receiverConfirmedAt ?? null,
        adminVerifiedAt: allocation.adminVerifiedAt ?? null,
        settledAt: allocation.settledAt ?? null,
      },
      createdAt: allocation.createdAt,
      actions: {
        payerCanSubmitProof: allocation.status === P2PAllocationStatusEnum.ASSIGNED && !expired,
        receiverCanConfirm: allocation.status === P2PAllocationStatusEnum.PROOF_SUBMITTED,
        adminCanFinalize,
      },
    };
  }

  private async loadAllocationAttachments(allocationIds: string[]): Promise<Map<string, AllocationAttachmentDto[]>> {
    if (!allocationIds.length) return new Map();

    const links = await this.prisma.attachmentLink.findMany({
      where: {
        entityType: AttachmentLinkEntityType.P2P_ALLOCATION,
        entityId: { in: allocationIds },
      },
      include: {
        file: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const map = new Map<string, AllocationAttachmentDto[]>();
    for (const link of links) {
      const list = map.get(link.entityId) ?? [];
      list.push({
        id: link.id,
        kind: link.kind,
        createdAt: link.createdAt,
        file: {
          id: link.file.id,
          name: link.file.fileName,
          mime: link.file.mimeType,
          size: link.file.sizeBytes,
        },
      });
      map.set(link.entityId, list);
    }

    return map;
  }

  async listAdminWithdrawals(query: AdminP2PWithdrawalsQueryDto): Promise<P2PListResponseDto<WithdrawalVmDto>> {
    const { skip, take, page, limit } = this.paginationService.getSkipTake(query.page, query.limit);
    const statusList = this.parseStatusFilter(query.status);
    const allocationsFilter =
      query.hasDispute && query.hasProof
        ? { some: { AND: [{ status: P2PAllocationStatusEnum.DISPUTED }, { proofSubmittedAt: { not: null } }] } }
        : query.hasDispute
          ? { some: { status: P2PAllocationStatusEnum.DISPUTED } }
          : query.hasProof
            ? { some: { proofSubmittedAt: { not: null } } }
            : undefined;

    const where: Prisma.WithdrawRequestWhereInput = {
      purpose: RequestPurposeEnum.P2P,
      status: statusList ? { in: statusList as WithdrawStatus[] } : undefined,
      userId: query.userId,
      amount: {
        gte: query.amountMin ? new Decimal(query.amountMin) : undefined,
        lte: query.amountMax ? new Decimal(query.amountMax) : undefined,
      },
      createdAt:
        query.createdFrom || query.createdTo
          ? { gte: query.createdFrom ? new Date(query.createdFrom) : undefined, lte: query.createdTo ? new Date(query.createdTo) : undefined }
          : undefined,
      user: query.mobile ? { mobile: { contains: query.mobile, mode: 'insensitive' as const } } : undefined,
      bankName: query.destinationBank ? { contains: query.destinationBank, mode: 'insensitive' as const } : undefined,
      destinationSnapshot: query.destinationType
        ? {
            path: ['type'],
            equals: query.destinationType,
          }
        : undefined,
      allocations: allocationsFilter,
    };

    const orderBy: Prisma.WithdrawRequestOrderByWithRelationInput[] = [{ createdAt: 'desc' }];
    if (query.sort === P2PWithdrawalListSort.CREATED_AT_ASC) orderBy.unshift({ createdAt: 'asc' });
    if (query.sort === P2PWithdrawalListSort.AMOUNT_ASC) orderBy.unshift({ amount: 'asc' });
    if (query.sort === P2PWithdrawalListSort.AMOUNT_DESC) orderBy.unshift({ amount: 'desc' });

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.withdrawRequest.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          purpose: true,
          channel: true,
          amount: true,
          status: true,
          assignedAmountTotal: true,
          settledAmountTotal: true,
          destinationSnapshot: true,
          bankName: true,
          iban: true,
          cardNumber: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.withdrawRequest.count({ where }),
    ]);

    let mapped = items.map((withdrawal) => this.buildWithdrawalVm(withdrawal));
    let filteredTotal = totalCount;

    if (query.remainingToAssignMin) {
      const min = new Decimal(query.remainingToAssignMin);
      mapped = mapped.filter((item) => new Decimal(item.totals.remainingToAssign).gte(min));
      filteredTotal = mapped.length;
    }

    if (query.sort === P2PWithdrawalListSort.REMAINING_ASC) {
      mapped.sort((a, b) => new Decimal(a.totals.remainingToAssign).cmp(b.totals.remainingToAssign));
    }
    if (query.sort === P2PWithdrawalListSort.REMAINING_DESC) {
      mapped.sort((a, b) => new Decimal(b.totals.remainingToAssign).cmp(a.totals.remainingToAssign));
    }
    if (query.sort === P2PWithdrawalListSort.PRIORITY) {
      mapped.sort((a, b) => {
        const dateDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Decimal(b.totals.remainingToAssign).cmp(a.totals.remainingToAssign);
      });
    }

    return {
      data: mapped,
      meta: this.buildListMeta({
        total: filteredTotal,
        limit,
        sort: query.sort ?? P2PWithdrawalListSort.CREATED_AT_DESC,
        filtersApplied: {
          status: statusList,
          userId: query.userId,
          mobile: query.mobile,
          amountMin: query.amountMin,
          amountMax: query.amountMax,
          remainingToAssignMin: query.remainingToAssignMin,
          hasDispute: query.hasDispute,
          hasProof: query.hasProof,
        },
      }),
    };
  }

  async listCandidates(
    withdrawalId: string,
    query: AdminP2PWithdrawalCandidatesQueryDto,
  ): Promise<P2PListResponseDto<DepositVmDto>> {
    const withdrawal = await this.prisma.withdrawRequest.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) throw new NotFoundException('Withdraw not found');
    if (withdrawal.purpose !== RequestPurposeEnum.P2P) {
      throw new BadRequestException({ code: 'P2P_FORBIDDEN', message: 'Withdrawal is not P2P.' });
    }

    const statusList = this.parseStatusFilter(query.status);
    const where: Prisma.DepositRequestWhereInput = {
      purpose: RequestPurposeEnum.P2P,
      status: statusList ? { in: statusList as DepositStatus[] } : undefined,
      userId: query.userId,
      remainingAmount: { gt: new Decimal(0) },
      createdAt:
        query.createdFrom || query.createdTo
          ? { gte: query.createdFrom ? new Date(query.createdFrom) : undefined, lte: query.createdTo ? new Date(query.createdTo) : undefined }
          : undefined,
      user: query.mobile ? { mobile: { contains: query.mobile, mode: 'insensitive' as const } } : undefined,
    };

    if (query.remainingMin) {
      where.remainingAmount = { gte: new Decimal(query.remainingMin) };
    }

    const orderBy: Prisma.DepositRequestOrderByWithRelationInput[] = [{ createdAt: 'desc' }];
    if (query.sort === P2PCandidateSort.CREATED_AT_ASC) orderBy.unshift({ createdAt: 'asc' });
    if (query.sort === P2PCandidateSort.REMAINING_DESC) orderBy.unshift({ remainingAmount: 'desc' });

    const { skip, take, limit } = this.paginationService.getSkipTake(query.page, query.limit);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.depositRequest.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          purpose: true,
          amount: true,
          remainingAmount: true,
          assignedAmountTotal: true,
          settledAmountTotal: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.depositRequest.count({ where }),
    ]);

    const mapped = items.map((deposit) => this.buildDepositVm(deposit));

    return {
      data: mapped,
      meta: this.buildListMeta({
        total,
        limit,
        sort: query.sort ?? P2PCandidateSort.REMAINING_DESC,
        filtersApplied: {
          status: statusList,
          userId: query.userId,
          mobile: query.mobile,
          remainingMin: query.remainingMin,
        },
      }),
    };
  }

  async listAdminAllocations(query: AdminP2PAllocationsQueryDto): Promise<P2PListResponseDto<AllocationVmDto>> {
    const statusList = this.parseStatusFilter(query.status);
    const where: Prisma.P2PAllocationWhereInput = {
      status: statusList ? { in: statusList as P2PAllocationStatus[] } : undefined,
      withdrawalId: query.withdrawalId,
      depositId: query.depositId,
      paymentMethod: query.method,
      proofSubmittedAt: query.hasProof ? { not: null } : undefined,
      receiverConfirmedAt: query.receiverConfirmed ? { not: null } : undefined,
      adminVerifiedAt: query.adminVerified ? { not: null } : undefined,
      expiresAt: query.expired ? { lt: new Date() } : undefined,
      createdAt:
        query.createdFrom || query.createdTo
          ? { gte: query.createdFrom ? new Date(query.createdFrom) : undefined, lte: query.createdTo ? new Date(query.createdTo) : undefined }
          : undefined,
      payerPaidAt:
        query.paidFrom || query.paidTo
          ? { gte: query.paidFrom ? new Date(query.paidFrom) : undefined, lte: query.paidTo ? new Date(query.paidTo) : undefined }
          : undefined,
      deposit: query.payerUserId ? { userId: query.payerUserId } : undefined,
      withdrawal: query.receiverUserId ? { userId: query.receiverUserId } : undefined,
    };

    const { skip, take, limit } = this.paginationService.getSkipTake(query.page, query.limit);

    const orderBy: Prisma.P2PAllocationOrderByWithRelationInput[] = [{ createdAt: 'desc' }];
    if (query.sort === P2PAllocationSort.EXPIRES_AT_ASC) orderBy.unshift({ expiresAt: 'asc' });
    if (query.sort === P2PAllocationSort.PAID_AT_DESC) orderBy.unshift({ payerPaidAt: 'desc' });
    if (query.sort === P2PAllocationSort.AMOUNT_DESC) orderBy.unshift({ amount: 'desc' });

    const [items, total] = await this.prisma.$transaction([
      this.prisma.p2PAllocation.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          deposit: { include: { user: true } },
          withdrawal: { include: { user: true } },
        },
      }),
      this.prisma.p2PAllocation.count({ where }),
    ]);

    const attachmentMap = await this.loadAllocationAttachments(items.map((item) => item.id));

    return {
      data: items.map((allocation) =>
        this.buildAllocationVm({
          allocation,
          attachments: attachmentMap.get(allocation.id) ?? [],
          includeDestination: true,
        }),
      ),
      meta: this.buildListMeta({
        total,
        limit,
        sort: query.sort ?? P2PAllocationSort.CREATED_AT_DESC,
        filtersApplied: {
          status: statusList,
          withdrawalId: query.withdrawalId,
          depositId: query.depositId,
          payerUserId: query.payerUserId,
          receiverUserId: query.receiverUserId,
        },
      }),
    };
  }

  async assignAllocations(
    withdrawalId: string,
    dto: { items: { depositId: string; amount: string }[] },
    idempotencyKey?: string,
  ): Promise<AllocationVmDto[]> {
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
            return existing.responseJson as AllocationVmDto[];
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
        const allocations: AllocationVmDto[] = [];
        let withdrawalAssignedTotal = dec(withdrawal.assignedAmountTotal);
        const depositState = new Map(
          deposits.map((deposit) => [
            deposit.id,
            {
              assignedTotal: dec(deposit.assignedAmountTotal),
              remaining: dec(deposit.remainingAmount ?? deposit.amount),
              settledTotal: dec(deposit.settledAmountTotal),
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
              paymentMethod: PaymentMethodEnum.UNKNOWN,
            },
            include: {
              deposit: { include: { user: true } },
              withdrawal: { include: { user: true } },
            },
          });

          await this.splitReservationForAllocation(tx, withdrawal, allocation.id, amount);

          withdrawalAssignedTotal = withdrawalAssignedTotal.add(amount);
          state.assignedTotal = state.assignedTotal.add(amount);
          state.remaining = state.remaining.sub(amount);

          const withdrawStatus = deriveWithdrawP2PStatus({
            amount: withdrawal.amount,
            assignedTotal: withdrawalAssignedTotal,
            settledTotal: withdrawal.settledAmountTotal,
          });

          await tx.withdrawRequest.update({
            where: { id: withdrawal.id },
            data: {
              assignedAmountTotal: withdrawalAssignedTotal,
              status: withdrawStatus,
              channel: withdrawal.channel ?? WithdrawalChannelEnum.USER_TO_USER,
            },
          });

          const depositStatus = deriveDepositP2PStatus({
            requestedAmount: deposit.amount,
            assignedTotal: state.assignedTotal,
            settledTotal: state.settledTotal,
          });

          await tx.depositRequest.update({
            where: { id: deposit.id },
            data: {
              assignedAmountTotal: state.assignedTotal,
              remainingAmount: state.remaining,
              status: depositStatus,
            },
          });

          allocations.push(
            this.buildAllocationVm({
              allocation,
              attachments: [],
              includeDestination: true,
            }),
          );
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

  async listMyAllocationsAsPayer(
    userId: string,
    query: P2PAllocationQueryDto,
  ): Promise<P2PListResponseDto<AllocationVmDto>> {
    const statusList = this.parseStatusFilter(query.status ?? 'ASSIGNED,PROOF_SUBMITTED');
    const where: Prisma.P2PAllocationWhereInput = {
      status: statusList ? { in: statusList as P2PAllocationStatus[] } : undefined,
      deposit: { userId },
    };

    if (query.expiresSoon) {
      const threshold = new Date(Date.now() + Number(query.expiresSoon) * 60_000);
      where.expiresAt = { lte: threshold };
    }

    const { skip, take, limit } = this.paginationService.getSkipTake(query.page, query.limit);
    const orderBy: Prisma.P2PAllocationOrderByWithRelationInput[] = [{ expiresAt: 'asc' }];
    if (query.sort === P2PAllocationSort.CREATED_AT_DESC) orderBy.unshift({ createdAt: 'desc' });

    const [items, total] = await this.prisma.$transaction([
      this.prisma.p2PAllocation.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          deposit: { include: { user: true } },
          withdrawal: { include: { user: true } },
        },
      }),
      this.prisma.p2PAllocation.count({ where }),
    ]);

    const attachmentMap = await this.loadAllocationAttachments(items.map((item) => item.id));

    return {
      data: items.map((allocation) =>
        this.buildAllocationVm({
          allocation,
          attachments: attachmentMap.get(allocation.id) ?? [],
          includeDestination: true,
        }),
      ),
      meta: this.buildListMeta({
        total,
        limit,
        sort: query.sort ?? P2PAllocationSort.EXPIRES_AT_ASC,
        filtersApplied: {
          status: statusList,
          expiresSoon: query.expiresSoon,
        },
      }),
    };
  }

  async submitPayerProof(
    allocationId: string,
    userId: string,
    params: P2PAllocationProofDto,
  ): Promise<AllocationVmDto> {
    if (!params.fileIds?.length) {
      throw new BadRequestException({ code: 'P2P_PROOF_REQUIRED', message: 'Proof file(s) required.' });
    }

    return runInTx(this.prisma, async (tx) => {
      await this.lockAllocationRow(tx, allocationId);
      const allocation = await tx.p2PAllocation.findUnique({
        where: { id: allocationId },
        include: {
          deposit: { include: { user: true } },
          withdrawal: { include: { user: true } },
        },
      });
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

      const files = await tx.file.findMany({
        where: { id: { in: params.fileIds } },
        select: { id: true, uploadedById: true },
      });
      if (files.length !== params.fileIds.length) {
        throw new BadRequestException('Invalid file IDs');
      }
      if (files.some((file) => file.uploadedById !== userId)) {
        throw new ForbiddenException({ code: 'P2P_FORBIDDEN', message: 'Files must belong to payer.' });
      }

      await tx.attachmentLink.createMany({
        data: params.fileIds.map((fileId) => ({
          entityType: AttachmentLinkEntityType.P2P_ALLOCATION,
          entityId: allocation.id,
          kind: AttachmentLinkKind.P2P_PROOF,
          fileId,
          uploaderUserId: userId,
        })),
      });

      const updated = await tx.p2PAllocation.update({
        where: { id: allocation.id },
        data: {
          status: P2PAllocationStatusEnum.PROOF_SUBMITTED,
          payerBankRef: params.bankRef,
          paymentMethod: params.method,
          payerPaidAt: params.paidAt ? new Date(params.paidAt) : new Date(),
          proofSubmittedAt: new Date(),
        },
        include: {
          deposit: { include: { user: true } },
          withdrawal: { include: { user: true } },
        },
      });

      const attachments = await this.loadAllocationAttachments([updated.id]);
      return this.buildAllocationVm({
        allocation: updated,
        attachments: attachments.get(updated.id) ?? [],
        includeDestination: true,
      });
    });
  }

  async listMyAllocationsAsReceiver(
    userId: string,
    query: P2PAllocationQueryDto,
  ): Promise<P2PListResponseDto<AllocationVmDto>> {
    const statusList = this.parseStatusFilter(query.status ?? 'PROOF_SUBMITTED,DISPUTED');
    const where: Prisma.P2PAllocationWhereInput = {
      status: statusList ? { in: statusList as P2PAllocationStatus[] } : undefined,
      withdrawal: { userId },
    };

    const { skip, take, limit } = this.paginationService.getSkipTake(query.page, query.limit);
    const orderBy: Prisma.P2PAllocationOrderByWithRelationInput[] = [{ createdAt: 'desc' }];
    if (query.sort === P2PAllocationSort.PAID_AT_DESC) orderBy.unshift({ payerPaidAt: 'desc' });

    const [items, total] = await this.prisma.$transaction([
      this.prisma.p2PAllocation.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          deposit: { include: { user: true } },
          withdrawal: { include: { user: true } },
        },
      }),
      this.prisma.p2PAllocation.count({ where }),
    ]);

    const attachmentMap = await this.loadAllocationAttachments(items.map((item) => item.id));

    return {
      data: items.map((allocation) =>
        this.buildAllocationVm({
          allocation,
          attachments: attachmentMap.get(allocation.id) ?? [],
          includeDestination: false,
        }),
      ),
      meta: this.buildListMeta({
        total,
        limit,
        sort: query.sort ?? P2PAllocationSort.PAID_AT_DESC,
        filtersApplied: {
          status: statusList,
        },
      }),
    };
  }

  async receiverConfirm(
    allocationId: string,
    userId: string,
    params: { confirmed: boolean; reason?: string },
  ): Promise<AllocationVmDto> {
    return runInTx(this.prisma, async (tx) => {
      await this.lockAllocationRow(tx, allocationId);
      const allocation = await tx.p2PAllocation.findUnique({
        where: { id: allocationId },
        include: { withdrawal: { include: { user: true } }, deposit: { include: { user: true } } },
      });
      if (!allocation) throw new NotFoundException('Allocation not found');
      if (allocation.withdrawal.userId !== userId) {
        throw new ForbiddenException({ code: 'P2P_FORBIDDEN', message: 'Forbidden' });
      }

      if (![P2PAllocationStatusEnum.PROOF_SUBMITTED, P2PAllocationStatusEnum.ADMIN_VERIFIED].includes(allocation.status)) {
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
        include: { withdrawal: { include: { user: true } }, deposit: { include: { user: true } } },
      });

      const attachments = await this.loadAllocationAttachments([updated.id]);
      return this.buildAllocationVm({
        allocation: updated,
        attachments: attachments.get(updated.id) ?? [],
        includeDestination: false,
      });
    });
  }

  async adminVerify(allocationId: string, adminId: string, approved: boolean, note?: string): Promise<AllocationVmDto> {
    return runInTx(this.prisma, async (tx) => {
      await this.lockAllocationRow(tx, allocationId);
      const allocation = await tx.p2PAllocation.findUnique({
        where: { id: allocationId },
        include: { withdrawal: { include: { user: true } }, deposit: { include: { user: true } } },
      });
      if (!allocation) throw new NotFoundException('Allocation not found');

      if (![P2PAllocationStatusEnum.PROOF_SUBMITTED, P2PAllocationStatusEnum.RECEIVER_CONFIRMED].includes(allocation.status)) {
        throw new BadRequestException('Allocation is not awaiting verification');
      }

      const updateData = approved
        ? {
            status: P2PAllocationStatusEnum.ADMIN_VERIFIED,
            adminVerifiedAt: new Date(),
            adminVerifierId: adminId,
            adminNote: note ?? allocation.adminNote ?? null,
          }
        : {
            status: P2PAllocationStatusEnum.DISPUTED,
            adminVerifiedAt: new Date(),
            adminVerifierId: adminId,
            adminNote: note ?? allocation.adminNote ?? null,
          };

      const updated = await tx.p2PAllocation.update({
        where: { id: allocationId },
        data: updateData,
        include: { withdrawal: { include: { user: true } }, deposit: { include: { user: true } } },
      });

      const attachments = await this.loadAllocationAttachments([updated.id]);
      return this.buildAllocationVm({
        allocation: updated,
        attachments: attachments.get(updated.id) ?? [],
        includeDestination: true,
      });
    });
  }

  async finalizeAllocation(allocationId: string, adminId: string): Promise<AllocationVmDto> {
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
        const current = await tx.p2PAllocation.findUnique({
          where: { id: allocationId },
          include: { withdrawal: { include: { user: true } }, deposit: { include: { user: true } } },
        });
        const attachments = await this.loadAllocationAttachments([allocationId]);
        return this.buildAllocationVm({
          allocation: current,
          attachments: attachments.get(allocationId) ?? [],
          includeDestination: true,
        });
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

      const withdrawalSettled = addDec(allocation.withdrawal.settledAmountTotal, allocation.amount);
      const depositSettled = addDec(allocation.deposit.settledAmountTotal, allocation.amount);

      const withdrawalStatus = deriveWithdrawP2PStatus({
        amount: allocation.withdrawal.amount,
        assignedTotal: allocation.withdrawal.assignedAmountTotal,
        settledTotal: withdrawalSettled,
      });
      const depositStatus = deriveDepositP2PStatus({
        requestedAmount: allocation.deposit.amount,
        assignedTotal: allocation.deposit.assignedAmountTotal,
        settledTotal: depositSettled,
      });

      await tx.withdrawRequest.update({
        where: { id: allocation.withdrawalId },
        data: { settledAmountTotal: withdrawalSettled, status: withdrawalStatus },
      });

      await tx.depositRequest.update({
        where: { id: allocation.depositId },
        data: { settledAmountTotal: depositSettled, status: depositStatus },
      });

      const reloaded = await tx.p2PAllocation.findUnique({
        where: { id: allocation.id },
        include: { withdrawal: { include: { user: true } }, deposit: { include: { user: true } } },
      });

      const attachments = await this.loadAllocationAttachments([allocation.id]);
      return this.buildAllocationVm({
        allocation: reloaded,
        attachments: attachments.get(allocation.id) ?? [],
        includeDestination: true,
      });
    });
  }

  async cancelAllocation(allocationId: string): Promise<AllocationVmDto> {
    return runInTx(this.prisma, async (tx) => {
      await this.lockAllocationRow(tx, allocationId);
      const allocation = await tx.p2PAllocation.findUnique({
        where: { id: allocationId },
        include: { withdrawal: true, deposit: true },
      });
      if (!allocation) throw new NotFoundException('Allocation not found');
      await this.lockWithdrawRow(tx, allocation.withdrawalId);
      await this.lockDepositRows(tx, [allocation.depositId]);

      if ([P2PAllocationStatusEnum.CANCELLED, P2PAllocationStatusEnum.EXPIRED].includes(allocation.status)) {
        const reloaded = await tx.p2PAllocation.findUnique({
          where: { id: allocation.id },
          include: { withdrawal: { include: { user: true } }, deposit: { include: { user: true } } },
        });
        const attachments = await this.loadAllocationAttachments([allocation.id]);
        return this.buildAllocationVm({
          allocation: reloaded,
          attachments: attachments.get(allocation.id) ?? [],
          includeDestination: true,
        });
      }

      if (allocation.status === P2PAllocationStatusEnum.SETTLED) {
        throw new BadRequestException('Allocation already settled');
      }

      await this.mergeReservationBack(tx, allocation);

      const updated = await tx.p2PAllocation.update({
        where: { id: allocationId },
        data: { status: P2PAllocationStatusEnum.CANCELLED },
      });

      const withdrawalAssigned = subDec(allocation.withdrawal.assignedAmountTotal, allocation.amount);
      const depositAssigned = subDec(allocation.deposit.assignedAmountTotal, allocation.amount);

      const withdrawalStatus = deriveWithdrawP2PStatus({
        amount: allocation.withdrawal.amount,
        assignedTotal: withdrawalAssigned,
        settledTotal: allocation.withdrawal.settledAmountTotal,
      });
      const depositStatus = deriveDepositP2PStatus({
        requestedAmount: allocation.deposit.amount,
        assignedTotal: depositAssigned,
        settledTotal: allocation.deposit.settledAmountTotal,
      });

      await tx.withdrawRequest.update({
        where: { id: allocation.withdrawalId },
        data: { assignedAmountTotal: withdrawalAssigned, status: withdrawalStatus },
      });

      await tx.depositRequest.update({
        where: { id: allocation.depositId },
        data: {
          assignedAmountTotal: depositAssigned,
          remainingAmount: addDec(allocation.deposit.remainingAmount ?? allocation.deposit.amount, allocation.amount),
          status: depositStatus,
        },
      });

      const reloaded = await tx.p2PAllocation.findUnique({
        where: { id: updated.id },
        include: { withdrawal: { include: { user: true } }, deposit: { include: { user: true } } },
      });
      const attachments = await this.loadAllocationAttachments([updated.id]);

      return this.buildAllocationVm({
        allocation: reloaded,
        attachments: attachments.get(updated.id) ?? [],
        includeDestination: true,
      });
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
        if (![P2PAllocationStatusEnum.ASSIGNED, P2PAllocationStatusEnum.PROOF_SUBMITTED].includes(allocation.status)) {
          return;
        }

        await this.mergeReservationBack(tx, allocation);

        await tx.p2PAllocation.update({ where: { id }, data: { status: P2PAllocationStatusEnum.EXPIRED } });

        const withdrawalAssigned = subDec(allocation.withdrawal.assignedAmountTotal, allocation.amount);
        const depositAssigned = subDec(allocation.deposit.assignedAmountTotal, allocation.amount);

        const withdrawalStatus = deriveWithdrawP2PStatus({
          amount: allocation.withdrawal.amount,
          assignedTotal: withdrawalAssigned,
          settledTotal: allocation.withdrawal.settledAmountTotal,
        });
        const depositStatus = deriveDepositP2PStatus({
          requestedAmount: allocation.deposit.amount,
          assignedTotal: depositAssigned,
          settledTotal: allocation.deposit.settledAmountTotal,
        });

        await tx.withdrawRequest.update({
          where: { id: allocation.withdrawalId },
          data: { assignedAmountTotal: withdrawalAssigned, status: withdrawalStatus },
        });
        await tx.depositRequest.update({
          where: { id: allocation.depositId },
          data: {
            assignedAmountTotal: depositAssigned,
            remainingAmount: addDec(allocation.deposit.remainingAmount ?? allocation.deposit.amount, allocation.amount),
            status: depositStatus,
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
