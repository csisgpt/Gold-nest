import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DepositStatus,
  PaymentDestinationType,
  PaymentMethod,
  P2PAllocationStatus,
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
import { normalizeSort } from '../../common/pagination/query-parsers';
import { AccountsService } from '../accounts/accounts.service';
import { LimitsService } from '../policy/limits.service';
import { PaymentDestinationsService } from '../payment-destinations/payment-destinations.service';
import { runInTx } from '../../common/db/tx.util';
import { addDec, dec, subDec } from '../../common/utils/decimal.util';
import { IRR_INSTRUMENT_CODE } from '../accounts/constants';
import {
  AdminP2PAllocationsQueryDto,
  AdminP2PAllocationDetailVmDto,
  AdminP2PSystemDestinationListDto,
  AdminP2PWithdrawalCandidatesQueryDto,
  AdminP2PWithdrawalDetailVmDto,
  AdminP2PWithdrawalsQueryDto,
  AllocationAttachmentDto,
  AllocationDestinationDto,
  AllocationVmDto,
  DepositVmDto,
  P2PAllocationQueryDto,
  P2PAllocationProofDto,
  P2PListResponseDto,
  WithdrawalVmDto,
} from './dto/p2p-allocations.dto';
import { deriveDepositP2PStatus, deriveWithdrawP2PStatus } from './p2p-status.util';
import { maskDestinationValue } from '../payment-destinations/payment-destinations.crypto';

const DEFAULT_TTL_MINUTES = 1440;
const DEFAULT_EXPIRING_SOON_MINUTES = 60;
const URGENT_AGE_HOURS = 24;
const URGENT_REMAINING_THRESHOLD = new Decimal(10_000_000);
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
const P2PConfirmationModeEnum = {
  RECEIVER: 'RECEIVER',
  ADMIN: 'ADMIN',
  BOTH: 'BOTH',
  RECEIVER_OR_ADMIN: 'RECEIVER_OR_ADMIN',
} as const;
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

type P2PConfirmationModeType = 'RECEIVER' | 'ADMIN' | 'BOTH' | 'RECEIVER_OR_ADMIN';
type PaymentDestinationSnapshot = {
  type: PaymentDestinationType;
  value?: string;
  maskedValue?: string;
  bankName?: string | null;
  ownerName?: string | null;
  title?: string | null;
};

@Injectable()
export class P2PAllocationsService {
  private readonly logger = new Logger(P2PAllocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly accountsService: AccountsService,
    private readonly limitsService: LimitsService,
    private readonly paymentDestinationsService: PaymentDestinationsService,
  ) { }

  private getAllocationTtlMinutes(): number {
    const value = Number(process.env.P2P_ALLOCATION_TTL_MINUTES ?? DEFAULT_TTL_MINUTES);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_TTL_MINUTES;
  }

  private getExpiringSoonThreshold(minutes?: string): Date {
    const parsed = Number(minutes ?? DEFAULT_EXPIRING_SOON_MINUTES);
    const clamped = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRING_SOON_MINUTES;
    return new Date(Date.now() + clamped * 60_000);
  }

  private getConfirmationMode(): P2PConfirmationModeType {
    const raw = String(process.env.P2P_CONFIRMATION_MODE ?? 'RECEIVER').toUpperCase();
    if (raw === 'ADMIN') return P2PConfirmationModeEnum.ADMIN;
    if (raw === 'BOTH') return P2PConfirmationModeEnum.BOTH;
    if (raw === 'RECEIVER_OR_ADMIN' || raw === 'RECEIVER-OR-ADMIN') {
      return P2PConfirmationModeEnum.RECEIVER_OR_ADMIN;
    }
    return P2PConfirmationModeEnum.RECEIVER;
  }

  private ensureFinalizable(allocation: {
    status: P2PAllocationStatus;
    receiverConfirmedAt: Date | null;
    adminVerifiedAt: Date | null;
  }) {
    if (allocation.status === P2PAllocationStatusEnum.DISPUTED) {
      throw new BadRequestException('Allocation cannot be finalized');
    }
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
    } else if (mode === P2PConfirmationModeEnum.RECEIVER_OR_ADMIN) {
      if (!allocation.receiverConfirmedAt && !allocation.adminVerifiedAt) {
        throw new BadRequestException({
          code: 'P2P_ALLOCATION_NOT_FINALIZABLE',
          message: 'Allocation requires receiver or admin confirmation.',
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

  private allocationExpiresSoon(allocation: { expiresAt: Date }, threshold?: Date): boolean {
    const check = threshold ?? this.getExpiringSoonThreshold();
    const now = Date.now();
    return allocation.expiresAt.getTime() <= check.getTime() && allocation.expiresAt.getTime() > now;
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
    flags?: {
      hasDispute?: boolean;
      hasProof?: boolean;
      hasExpiringAllocations?: boolean;
    };
  }): WithdrawalVmDto {
    const remainingToAssign = subDec(withdrawal.amount, withdrawal.assignedAmountTotal);
    const remainingToSettle = subDec(withdrawal.amount, withdrawal.settledAmountTotal);
    const destinationSnapshot = withdrawal.destinationSnapshot as {
      maskedValue?: string;
      type?: PaymentDestinationType;
      title?: string | null;
      bankName?: string | null;
    } | null;
    const masked = destinationSnapshot?.maskedValue
      ?? (withdrawal.iban ? maskDestinationValue(withdrawal.iban) : withdrawal.cardNumber ? maskDestinationValue(withdrawal.cardNumber) : null);

    const status = withdrawal.status;
    const closed = [WithdrawStatusEnum.CANCELLED, WithdrawStatusEnum.EXPIRED, WithdrawStatusEnum.SETTLED].includes(status);
    const canAssign = remainingToAssign.gt(0) && !closed;
    const canCancel = withdrawal.settledAmountTotal.eq(0) && !closed;
    const hasExpiringAllocations = withdrawal.flags?.hasExpiringAllocations ?? false;
    const hasDispute = withdrawal.flags?.hasDispute ?? false;
    const hasProof = withdrawal.flags?.hasProof ?? false;
    const urgentAgeCutoff = new Date(Date.now() - URGENT_AGE_HOURS * 60 * 60 * 1000);
    const isUrgent =
      hasExpiringAllocations ||
      remainingToAssign.gt(URGENT_REMAINING_THRESHOLD) ||
      withdrawal.createdAt < urgentAgeCutoff;


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
          fullValue: withdrawal.destinationSnapshot?.value ?? '',
          bankName: destinationSnapshot?.bankName ?? withdrawal.bankName ?? null,
          title: destinationSnapshot?.title ?? null,
        }
        : null,
      flags: {
        hasDispute,
        hasProof,
        hasExpiringAllocations,
        isUrgent,
      },
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
    const isFullyAvailable = remaining.eq(deposit.amount);

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
      flags: {
        isFullyAvailable,
        isExpiring: deposit.status === DepositStatusEnum.EXPIRED,
      },
    };
  }

  private buildAllocationVm(params: {
    allocation: any;
    attachments: AllocationAttachmentDto[];
    destinationMode: 'full' | 'masked' | 'none';
    includePayerExtras?: boolean;
    expiresSoonThreshold?: Date;
    actor?: 'ADMIN' | 'PAYER' | 'RECEIVER';
  }): AllocationVmDto {
    const { allocation, attachments, destinationMode, includePayerExtras, expiresSoonThreshold, actor } = params;
    const snapshot = allocation.destinationSnapshot as {
      type: PaymentDestinationType;
      value?: string;
      maskedValue?: string;
      bankName?: string | null;
      ownerName?: string | null;
      title?: string | null;
    };

    const destination: AllocationDestinationDto | null =
      destinationMode === 'none'
        ? null
        : {
          type: snapshot.type,
          bankName: snapshot.bankName ?? null,
          ownerName: snapshot.ownerName ?? null,
          title: snapshot.title ?? null,
          fullValue: destinationMode === 'full' ? snapshot.value ?? '' : null,
          masked: snapshot.maskedValue ?? maskDestinationValue(snapshot.value ?? ''),
        };

    const expired = allocation.status === P2PAllocationStatusEnum.ASSIGNED && this.allocationExpired(allocation);
    const expiresSoon = allocation.status === P2PAllocationStatusEnum.ASSIGNED
      && this.allocationExpiresSoon(allocation, expiresSoonThreshold);
    const adminCanFinalize = this.isFinalizable(allocation) && allocation.status !== P2PAllocationStatusEnum.SETTLED;
    const hasProof = attachments.length > 0 || allocation.proofSubmittedAt != null;
    const proofAttempts = attachments.filter((attachment) => attachment.kind === AttachmentLinkKind.P2P_PROOF).length;
    const payerCanSubmitProof =
      proofAttempts < 2
      && [P2PAllocationStatusEnum.ASSIGNED, P2PAllocationStatusEnum.PROOF_SUBMITTED].includes(allocation.status)
      && !allocation.receiverConfirmedAt
      && !allocation.adminVerifiedAt
      && allocation.status !== P2PAllocationStatusEnum.DISPUTED
      && allocation.status !== P2PAllocationStatusEnum.SETTLED
      && (allocation.status !== P2PAllocationStatusEnum.ASSIGNED || !expired);
    const confirmationMode = this.getConfirmationMode();
    const receiverConfirmAllowedByMode = confirmationMode === P2PConfirmationModeEnum.RECEIVER || confirmationMode === P2PConfirmationModeEnum.BOTH;
    const receiverCanConfirm = receiverConfirmAllowedByMode && allocation.status === P2PAllocationStatusEnum.PROOF_SUBMITTED;
    const expiresInSeconds = includePayerExtras
      ? Math.max(0, Math.floor((allocation.expiresAt.getTime() - Date.now()) / 1000))
      : undefined;

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
      expiresInSeconds,
      destinationCopyText: destinationMode !== 'none'
        ? this.buildDestinationCopyText({
          title: snapshot.title,
          bankName: snapshot.bankName,
          ownerName: snapshot.ownerName,
          value: destinationMode === 'full' ? snapshot.value : snapshot.maskedValue,
        })
        : undefined,
      timestamps: {
        proofSubmittedAt: allocation.proofSubmittedAt ?? null,
        receiverConfirmedAt: allocation.receiverConfirmedAt ?? null,
        adminVerifiedAt: allocation.adminVerifiedAt ?? null,
        settledAt: allocation.settledAt ?? null,
      },
      flags: {
        isExpired: expired,
        expiresSoon,
        hasProof,
        isFinalizable: this.isFinalizable(allocation),
      },
      createdAt: allocation.createdAt,
      actions: {
        payerCanSubmitProof,
        receiverCanConfirm,
        adminCanFinalize,
      },
      allowedActions: [
        { key: 'SUBMIT_PROOF', enabled: actor === 'PAYER' ? payerCanSubmitProof : false, reasonDisabled: actor === 'PAYER' && !payerCanSubmitProof ? 'Proof submission is not available in current status.' : undefined },
        { key: 'RECEIVER_CONFIRM', enabled: actor === 'RECEIVER' ? receiverCanConfirm : false, reasonDisabled: actor === 'RECEIVER' && !receiverCanConfirm ? (receiverConfirmAllowedByMode ? 'Receiver confirmation requires submitted proof.' : 'Receiver confirmation is disabled.') : undefined },
        { key: 'ADMIN_VERIFY', enabled: actor === 'ADMIN' ? [P2PAllocationStatusEnum.PROOF_SUBMITTED, P2PAllocationStatusEnum.RECEIVER_CONFIRMED].includes(allocation.status) : false, reasonDisabled: actor === 'ADMIN' && ![P2PAllocationStatusEnum.PROOF_SUBMITTED, P2PAllocationStatusEnum.RECEIVER_CONFIRMED].includes(allocation.status) ? 'Admin verify is not available in current status.' : undefined },
        { key: 'FINALIZE', enabled: actor === 'ADMIN' ? adminCanFinalize : false, reasonDisabled: actor === 'ADMIN' && !adminCanFinalize ? 'Allocation is not finalizable yet.' : undefined },
        { key: 'CANCEL', enabled: actor === 'ADMIN' ? [P2PAllocationStatusEnum.ASSIGNED, P2PAllocationStatusEnum.PROOF_SUBMITTED, P2PAllocationStatusEnum.RECEIVER_CONFIRMED, P2PAllocationStatusEnum.ADMIN_VERIFIED].includes(allocation.status) : false, reasonDisabled: actor === 'ADMIN' && ![P2PAllocationStatusEnum.ASSIGNED, P2PAllocationStatusEnum.PROOF_SUBMITTED, P2PAllocationStatusEnum.RECEIVER_CONFIRMED, P2PAllocationStatusEnum.ADMIN_VERIFIED].includes(allocation.status) ? 'Cancellation is not available in current status.' : undefined },
        { key: 'DISPUTE', enabled: actor === 'RECEIVER' ? receiverCanConfirm : false, reasonDisabled: actor === 'RECEIVER' && !receiverCanConfirm ? (receiverConfirmAllowedByMode ? 'Dispute is available after proof submission.' : 'Not available for this allocation.') : undefined },
      ],
      timeline: [
        { key: 'ASSIGNED', at: allocation.createdAt.toISOString(), byRole: 'ADMIN' },
        { key: 'DESTINATION_READY', at: allocation.createdAt.toISOString(), byRole: 'SYSTEM' },
        ...(allocation.proofSubmittedAt ? [{ key: 'PROOF_SUBMITTED', at: allocation.proofSubmittedAt.toISOString(), byRole: 'PAYER' }] : []),
        ...(allocation.receiverConfirmedAt ? [{ key: 'RECEIVER_CONFIRMED', at: allocation.receiverConfirmedAt.toISOString(), byRole: 'RECEIVER' }] : []),
        ...(allocation.adminVerifiedAt ? [{ key: 'ADMIN_VERIFIED', at: allocation.adminVerifiedAt.toISOString(), byRole: 'ADMIN' }] : []),
        ...(allocation.settledAt ? [{ key: 'SETTLED', at: allocation.settledAt.toISOString(), byRole: 'SYSTEM' }] : []),
        ...(allocation.status === P2PAllocationStatusEnum.CANCELLED ? [{ key: 'CANCELLED', at: allocation.updatedAt.toISOString(), byRole: 'ADMIN' }] : []),
        ...((allocation.status === P2PAllocationStatusEnum.EXPIRED || (allocation.status === P2PAllocationStatusEnum.ASSIGNED && this.allocationExpired(allocation))) ? [{ key: 'EXPIRED', at: allocation.expiresAt.toISOString(), byRole: 'SYSTEM' }] : []),
      ].sort((a, b) => a.at.localeCompare(b.at)) as any,
      proofRequirements: includePayerExtras
        ? { bankRefRequired: true, paidAtRequired: false, attachmentRequired: true, maxFiles: 5, maxSizeMb: 10, allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'] }
        : undefined,
      instructions: includePayerExtras
        ? ['Pay the exact amount.', 'Enter the transfer reference number.', 'Upload a clear payment receipt.']
        : undefined,
      riskFlags: [
        ...(expired ? ['EXPIRED'] : []),
        ...(allocation.status === P2PAllocationStatusEnum.DISPUTED ? ['DISPUTED'] : []),
        ...(expiresSoon ? ['EXPIRES_SOON'] : []),
        ...(!hasProof && [P2PAllocationStatusEnum.ASSIGNED, P2PAllocationStatusEnum.PROOF_SUBMITTED].includes(allocation.status) ? ['MISSING_PROOF'] : []),
      ],
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

  private buildDestinationCopyText(snapshot?: {
    title?: string | null;
    bankName?: string | null;
    ownerName?: string | null;
    value?: string;
  }): string | undefined {
    if (!snapshot?.value) return undefined;
    const parts = [];
    if (snapshot.title) parts.push(snapshot.title);
    if (snapshot.bankName) parts.push(snapshot.bankName);
    if (snapshot.ownerName) parts.push(snapshot.ownerName);
    parts.push(snapshot.value);
    return parts.join('\n');
  }

  private normalizeAssignItems(dto: {
    amount?: string;
    candidateId?: string;
    depositId?: string;
    items?: { depositId: string; amount: string }[];
  }): { depositId: string; amount: string }[] {
    if (dto.items?.length) return dto.items;
    const singleId = dto.depositId ?? dto.candidateId;
    if (singleId && dto.amount) return [{ depositId: singleId, amount: dto.amount }];
    return [];
  }

  private async resolveAssignmentDestinationSnapshot(withdrawal: any, dto: { mode?: 'SYSTEM_DESTINATION'; destinationId?: string }): Promise<PaymentDestinationSnapshot> {
    if (dto.mode === 'SYSTEM_DESTINATION') {
      if (!dto.destinationId) {
        throw new BadRequestException({ code: 'P2P_ASSIGN_INVALID', message: 'destinationId is required for SYSTEM_DESTINATION mode.' });
      }
      return this.paymentDestinationsService.resolveCollectionDestination(dto.destinationId);
    }

    let destinationSnapshot = withdrawal.destinationSnapshot as PaymentDestinationSnapshot | null
      ?? this.paymentDestinationsService.buildLegacySnapshot({
        iban: withdrawal.iban,
        cardNumber: withdrawal.cardNumber,
        bankName: withdrawal.bankName,
      });
    if (!destinationSnapshot) {
      throw new BadRequestException({ code: 'P2P_WITHDRAWAL_MISSING_DESTINATION', message: 'Withdrawal destination is missing.' });
    }

    if (withdrawal.payoutDestinationId && !destinationSnapshot.title) {
      const channel = withdrawal.channel ?? WithdrawalChannelEnum.USER_TO_USER;
      const resolved = channel === WithdrawalChannelEnum.USER_TO_ORG
        ? await this.paymentDestinationsService.resolveCollectionDestination(withdrawal.payoutDestinationId)
        : await this.paymentDestinationsService.resolvePayoutDestinationForUser(withdrawal.userId, withdrawal.payoutDestinationId);
      destinationSnapshot = {
        ...destinationSnapshot,
        value: destinationSnapshot.value ?? resolved.value,
        maskedValue: destinationSnapshot.maskedValue ?? resolved.maskedValue,
        bankName: destinationSnapshot.bankName ?? resolved.bankName,
        ownerName: destinationSnapshot.ownerName ?? resolved.ownerName,
        title: resolved.title ?? destinationSnapshot.title ?? null,
      };
    }

    return destinationSnapshot;
  }

  private buildFinalizableWhere(): Prisma.P2PAllocationWhereInput {
    const base = {
      status: {
        notIn: [
          P2PAllocationStatusEnum.SETTLED,
          P2PAllocationStatusEnum.CANCELLED,
          P2PAllocationStatusEnum.EXPIRED,
          P2PAllocationStatusEnum.DISPUTED,
        ],
      },
      expiresAt: { gt: new Date() },
    } as Prisma.P2PAllocationWhereInput;

    const mode = this.getConfirmationMode();
    if (mode === P2PConfirmationModeEnum.RECEIVER) {
      return { ...base, receiverConfirmedAt: { not: null } };
    }
    if (mode === P2PConfirmationModeEnum.ADMIN) {
      return { ...base, adminVerifiedAt: { not: null } };
    }
    if (mode === P2PConfirmationModeEnum.RECEIVER_OR_ADMIN) {
      return {
        ...base,
        OR: [{ receiverConfirmedAt: { not: null } }, { adminVerifiedAt: { not: null } }],
      };
    }
    return {
      ...base,
      receiverConfirmedAt: { not: null },
      adminVerifiedAt: { not: null },
    };
  }

  private buildOpsFinalizableWhere(): Prisma.P2PAllocationWhereInput {
    const base = {
      status: { notIn: [P2PAllocationStatusEnum.SETTLED, P2PAllocationStatusEnum.DISPUTED] },
    } as Prisma.P2PAllocationWhereInput;

    const mode = this.getConfirmationMode();
    if (mode === P2PConfirmationModeEnum.RECEIVER) {
      return { ...base, receiverConfirmedAt: { not: null } };
    }
    if (mode === P2PConfirmationModeEnum.ADMIN) {
      return { ...base, adminVerifiedAt: { not: null } };
    }
    if (mode === P2PConfirmationModeEnum.RECEIVER_OR_ADMIN) {
      return {
        ...base,
        OR: [{ receiverConfirmedAt: { not: null } }, { adminVerifiedAt: { not: null } }],
      };
    }
    return {
      ...base,
      receiverConfirmedAt: { not: null },
      adminVerifiedAt: { not: null },
    };
  }

  async listAdminWithdrawals(query: AdminP2PWithdrawalsQueryDto): Promise<P2PListResponseDto<WithdrawalVmDto>> {
    const { page, limit } = this.paginationService.resolvePaging({
      page: query.page,
      limit: query.limit,
      offset: query.offset,
    });
    const skip = (page - 1) * limit;
    const take = limit;
    const statusList = this.parseStatusFilter(query.status);
    const expiringThreshold = this.getExpiringSoonThreshold(query.expiringSoonMinutes);
    const applyExpiringFilter = query.expiringSoonMinutes !== undefined;

    const baseFilters: Prisma.Sql[] = [Prisma.sql`w."purpose" = ${RequestPurposeEnum.P2P}::"RequestPurpose"`];
    if (statusList?.length) baseFilters.push(Prisma.sql`w."status" IN (${Prisma.join(statusList.map((s) => Prisma.sql`${s}::"WithdrawStatus"`))})`);
    if (query.userId) baseFilters.push(Prisma.sql`w."userId" = ${query.userId}`);
    if (query.amountMin) baseFilters.push(Prisma.sql`w."amount" >= ${new Decimal(query.amountMin)}`);
    if (query.amountMax) baseFilters.push(Prisma.sql`w."amount" <= ${new Decimal(query.amountMax)}`);
    if (query.createdFrom) baseFilters.push(Prisma.sql`w."createdAt" >= ${new Date(query.createdFrom)}`);
    if (query.createdTo) baseFilters.push(Prisma.sql`w."createdAt" <= ${new Date(query.createdTo)}`);
    if (query.mobile) baseFilters.push(Prisma.sql`u."mobile" ILIKE ${`%${query.mobile}%`}`);
    if (query.destinationBank) {
      baseFilters.push(Prisma.sql`w."bankName" ILIKE ${`%${query.destinationBank}%`}`);
    }
    if (query.destinationType) {
      baseFilters.push(Prisma.sql`w."destinationSnapshot"->>'type' = ${query.destinationType}`);
    }

    const baseWhere = Prisma.join(baseFilters, ' AND ');
    const proofStatusValues = [
      P2PAllocationStatusEnum.PROOF_SUBMITTED,
      P2PAllocationStatusEnum.RECEIVER_CONFIRMED,
      P2PAllocationStatusEnum.ADMIN_VERIFIED,
      P2PAllocationStatusEnum.SETTLED,
    ];
    // ⚠️ Postgres enum cast: prevents `"P2PAllocationStatus" = text` errors in $queryRaw
    const proofStatusList = Prisma.join(
      proofStatusValues.map((s) => Prisma.sql`${s}::"P2PAllocationStatus"`),
    );
    const expiringSql = Prisma.sql`BOOL_OR(a."status" IN (${Prisma.join([
      Prisma.sql`${P2PAllocationStatusEnum.ASSIGNED}::"P2PAllocationStatus"`,
    ])}) AND a."expiresAt" <= ${expiringThreshold})`;

    const baseQuery = Prisma.sql`
      WITH base AS (
        SELECT
          w.id,
          w."purpose",
          w."channel",
          w."amount",
          w."status",
          w."assignedAmountTotal",
          w."settledAmountTotal",
          w."destinationSnapshot",
          w."bankName",
          w."iban",
          w."cardNumber",
          w."createdAt",
          w."updatedAt",
          (w."amount" - w."assignedAmountTotal") AS "remainingToAssign",
          MIN(a."expiresAt") FILTER (WHERE a."status" IN (${Prisma.join([
      Prisma.sql`${P2PAllocationStatusEnum.ASSIGNED}::"P2PAllocationStatus"`,
    ])})) AS "nearestExpire",
          BOOL_OR(a."status" = ${P2PAllocationStatusEnum.DISPUTED}::"P2PAllocationStatus") AS "hasDispute",
          BOOL_OR(al.id IS NOT NULL OR a."status" IN (${proofStatusList})) AS "hasProof",
          ${expiringSql} AS "hasExpiring"
        FROM "WithdrawRequest" w
        JOIN "User" u ON u.id = w."userId"
        LEFT JOIN "P2PAllocation" a ON a."withdrawalId" = w.id
        LEFT JOIN "AttachmentLink" al ON al."entityType" = ${AttachmentLinkEntityType.P2P_ALLOCATION}::"AttachmentLinkEntityType"
          AND al."kind" = ${AttachmentLinkKind.P2P_PROOF}::"AttachmentLinkKind"
          AND al."entityId" = a.id
        WHERE ${baseWhere}
        GROUP BY w.id, w."purpose", w."channel", w."amount", w."status", w."assignedAmountTotal", w."settledAmountTotal",
          w."destinationSnapshot", w."bankName", w."iban", w."cardNumber", w."createdAt", w."updatedAt"
      )
      SELECT * FROM base
      WHERE 1=1
      ${query.remainingToAssignMin ? Prisma.sql`AND base."remainingToAssign" >= ${new Decimal(query.remainingToAssignMin)}` : Prisma.empty}
      ${query.remainingToAssignMax ? Prisma.sql`AND base."remainingToAssign" <= ${new Decimal(query.remainingToAssignMax)}` : Prisma.empty}
      ${query.hasDispute !== undefined ? Prisma.sql`AND base."hasDispute" = ${query.hasDispute}` : Prisma.empty}
      ${query.hasProof !== undefined ? Prisma.sql`AND base."hasProof" = ${query.hasProof}` : Prisma.empty}
      ${applyExpiringFilter ? Prisma.sql`AND base."hasExpiring" = true` : Prisma.empty}
    `;

    const sortCandidates = normalizeSort(
      {
        sort: query.sort,
        orderBy: query.orderBy,
        sortBy: query.sortBy,
        direction: query.direction,
        dir: query.dir,
        order: query.order,
      },
      {
        path: 'sort',
        allowedFields: ['createdAt', 'amount', 'remainingToAssign', 'priority', 'nearestExpire'],
      },
    );

    const primarySort = sortCandidates[0]?.field;
    const primaryDirection = sortCandidates[0]?.direction;

    const orderBy = (() => {
      if (primarySort === 'priority' || !primarySort) {
        return Prisma.sql`ORDER BY base."createdAt" ASC, base."remainingToAssign" DESC`;
      }
      if (primarySort === 'createdAt') {
        return Prisma.sql`ORDER BY base."createdAt" ${primaryDirection === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}`;
      }
      if (primarySort === 'amount') {
        return Prisma.sql`ORDER BY base."amount" ${primaryDirection === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}, base."createdAt" ASC`;
      }
      if (primarySort === 'remainingToAssign') {
        return Prisma.sql`ORDER BY base."remainingToAssign" ${primaryDirection === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}, base."createdAt" ASC`;
      }
      if (primarySort === 'nearestExpire') {
        return Prisma.sql`ORDER BY base."nearestExpire" ${primaryDirection === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`} NULLS LAST, base."createdAt" ASC`;
      }
      return Prisma.sql`ORDER BY base."createdAt" DESC`;
    })();

    const countQuery = Prisma.sql`SELECT COUNT(*)::int AS count FROM (${baseQuery}) AS base`;
    const idsQuery = Prisma.sql`
      SELECT base.id FROM (${baseQuery}) AS base
      ${orderBy}
      LIMIT ${take} OFFSET ${skip}
    `;

    const [countRows, idRows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ count: number }[]>(countQuery),
      this.prisma.$queryRaw<{ id: string }[]>(idsQuery),
    ]);

    const ids = idRows.map((row) => row.id);
    if (ids.length === 0) {
      return {
        items: [],
        meta: this.paginationService.meta(countRows[0]?.count ?? 0, page, limit),
      };
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
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
        hasDispute: boolean;
        hasProof: boolean;
        hasExpiring: boolean;
      }>
    >(Prisma.sql`
      SELECT * FROM (${baseQuery}) AS base WHERE base.id IN (${Prisma.join(ids)})
    `);

    const rowMap = new Map(rows.map((row) => [row.id, row]));
    const items = ids
      .map((id) => rowMap.get(id))
      .filter(Boolean)
      .map((row) =>
        this.buildWithdrawalVm({
          ...row!,
          amount: new Decimal(row!.amount),
          assignedAmountTotal: new Decimal(row!.assignedAmountTotal),
          settledAmountTotal: new Decimal(row!.settledAmountTotal),
          flags: {
            hasDispute: row!.hasDispute,
            hasProof: row!.hasProof,
            hasExpiringAllocations: row!.hasExpiring,
          },
        }),
      );

    return {
      items,
      meta: this.paginationService.meta(countRows[0]?.count ?? 0, page, limit),
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
    const excludedUserIds = Array.from(
      new Set([withdrawal.userId, query.excludeUserId].filter(Boolean) as string[]),
    );
    const where: Prisma.DepositRequestWhereInput = {
      purpose: RequestPurposeEnum.P2P,
      status: statusList ? { in: statusList as DepositStatus[] } : undefined,
      remainingAmount: {
        gt: new Decimal(0),
        ...(query.remainingMin ? { gte: new Decimal(query.remainingMin) } : undefined),
      },
      createdAt:
        query.createdFrom || query.createdTo
          ? { gte: query.createdFrom ? new Date(query.createdFrom) : undefined, lte: query.createdTo ? new Date(query.createdTo) : undefined }
          : undefined,
      user: query.mobile ? { mobile: { contains: query.mobile, mode: 'insensitive' as const } } : undefined,
    };

    const andFilters: Prisma.DepositRequestWhereInput[] = [];
    if (query.userId) {
      andFilters.push({ userId: query.userId });
    }
    if (excludedUserIds.length) {
      andFilters.push({ userId: { notIn: excludedUserIds } });
    }
    if (andFilters.length) {
      where.AND = andFilters;
    }

    const candidateSort = normalizeSort(
      {
        sort: query.sort,
        orderBy: query.orderBy,
        sortBy: query.sortBy,
        direction: query.direction,
        dir: query.dir,
        order: query.order,
      },
      { path: 'sort', allowedFields: ['createdAt', 'remaining', 'remainingAmount'] },
    );
    const candidatePrimary = candidateSort[0];
    const orderBy: Prisma.DepositRequestOrderByWithRelationInput[] = [{ createdAt: 'desc' }];
    if (candidatePrimary?.field === 'createdAt') {
      orderBy.unshift({ createdAt: candidatePrimary.direction });
    }
    if (candidatePrimary?.field === 'remaining' || candidatePrimary?.field === 'remainingAmount') {
      orderBy.unshift({ remainingAmount: candidatePrimary.direction });
    }

    const { page, limit } = this.paginationService.resolvePaging({
      page: query.page,
      limit: query.limit,
      offset: query.offset,
    });
    const { skip, take } = this.paginationService.getSkipTake(page, limit);

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
      items: mapped,
      meta: this.paginationService.meta(total, page, limit),
    };
  }

  async listAdminAllocations(query: AdminP2PAllocationsQueryDto): Promise<P2PListResponseDto<AllocationVmDto>> {
    const statusList = this.parseStatusFilter(query.status);
    const { page, limit } = this.paginationService.resolvePaging({
      page: query.page,
      limit: query.limit,
      offset: query.offset,
    });
    const { skip, take } = this.paginationService.getSkipTake(page, limit);
    const expiringThreshold = this.getExpiringSoonThreshold(query.expiresSoonMinutes);
    const applyExpiringFilter = query.expiresSoonMinutes !== undefined;

    const filters: Prisma.Sql[] = [];
    if (statusList?.length) {
      filters.push(
        Prisma.sql`a."status" IN (${Prisma.join(statusList.map((s) => Prisma.sql`${s}::"P2PAllocationStatus"`))})`,
      );
    }
    if (query.withdrawalId) filters.push(Prisma.sql`a."withdrawalId" = ${query.withdrawalId}`);
    if (query.depositId) filters.push(Prisma.sql`a."depositId" = ${query.depositId}`);
    if (query.method) filters.push(Prisma.sql`a."paymentMethod" = ${query.method}::"PaymentMethod"`);
    const bankRefSearch = query.bankRefSearch ?? query.bankRef;
    if (bankRefSearch) filters.push(Prisma.sql`a."payerBankRef" ILIKE ${`%${bankRefSearch}%`}`);
    if (query.receiverConfirmed !== undefined) {
      filters.push(
        Prisma.sql`a."receiverConfirmedAt" IS ${query.receiverConfirmed ? Prisma.sql`NOT NULL` : Prisma.sql`NULL`}`,
      );
    }
    if (query.adminVerified !== undefined) {
      filters.push(
        Prisma.sql`a."adminVerifiedAt" IS ${query.adminVerified ? Prisma.sql`NOT NULL` : Prisma.sql`NULL`}`,
      );
    }
    if (query.createdFrom) filters.push(Prisma.sql`a."createdAt" >= ${new Date(query.createdFrom)}`);
    if (query.createdTo) filters.push(Prisma.sql`a."createdAt" <= ${new Date(query.createdTo)}`);
    if (query.paidFrom) filters.push(Prisma.sql`a."payerPaidAt" >= ${new Date(query.paidFrom)}`);
    if (query.paidTo) filters.push(Prisma.sql`a."payerPaidAt" <= ${new Date(query.paidTo)}`);
    if (query.payerUserId) filters.push(Prisma.sql`d."userId" = ${query.payerUserId}`);
    if (query.receiverUserId) filters.push(Prisma.sql`w."userId" = ${query.receiverUserId}`);
    if (query.expired) {
      filters.push(
        Prisma.sql`a."status" IN (${Prisma.join([
          Prisma.sql`${P2PAllocationStatusEnum.ASSIGNED}::"P2PAllocationStatus"`,
        ])}) AND a."expiresAt" < ${new Date()}`,
      );
    }
    if (applyExpiringFilter) {
      filters.push(
        Prisma.sql`a."status" IN (${Prisma.join([
          Prisma.sql`${P2PAllocationStatusEnum.ASSIGNED}::"P2PAllocationStatus"`,
        ])}) AND a."expiresAt" <= ${expiringThreshold}`,
      );
    }

    const whereClause = filters.length ? Prisma.join(filters, ' AND ') : Prisma.sql`true`;

    const baseQuery = Prisma.sql`
      SELECT
        a.id,
        a."expiresAt",
        a."payerPaidAt",
        a."amount",
        a."createdAt"
      FROM "P2PAllocation" a
      JOIN "DepositRequest" d ON d.id = a."depositId"
      JOIN "WithdrawRequest" w ON w.id = a."withdrawalId"
      LEFT JOIN "AttachmentLink" al ON al."entityType" = ${AttachmentLinkEntityType.P2P_ALLOCATION}::"AttachmentLinkEntityType"
        AND al."kind" = ${AttachmentLinkKind.P2P_PROOF}::"AttachmentLinkKind"
        AND al."entityId" = a.id
      WHERE ${whereClause}
      ${query.hasProof !== undefined ? Prisma.sql`AND ${(query.hasProof ? Prisma.sql`al.id IS NOT NULL` : Prisma.sql`al.id IS NULL`)}` : Prisma.empty}
      GROUP BY a.id, a."expiresAt", a."payerPaidAt", a."amount", a."createdAt"
    `;

    const allocationSort = normalizeSort(
      {
        sort: query.sort,
        orderBy: query.orderBy,
        sortBy: query.sortBy,
        direction: query.direction,
        dir: query.dir,
        order: query.order,
      },
      { path: 'sort', allowedFields: ['createdAt', 'expiresAt', 'paidAt', 'amount'] },
    );
    const allocationPrimary = allocationSort[0];
    const orderBy = (() => {
      if (allocationPrimary?.field === 'expiresAt') {
        return Prisma.sql`ORDER BY base."expiresAt" ${allocationPrimary.direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`}`;
      }
      if (allocationPrimary?.field === 'paidAt') {
        return Prisma.sql`ORDER BY base."payerPaidAt" ${allocationPrimary.direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`} NULLS LAST`;
      }
      if (allocationPrimary?.field === 'amount') {
        return Prisma.sql`ORDER BY base."amount" ${allocationPrimary.direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`}`;
      }
      return Prisma.sql`ORDER BY base."createdAt" ${allocationPrimary?.direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}`;
    })();

    const countQuery = Prisma.sql`SELECT COUNT(*)::int AS count FROM (${baseQuery}) AS base`;
    const idsQuery = Prisma.sql`
      SELECT base.id FROM (${baseQuery}) AS base
      ${orderBy}
      LIMIT ${take} OFFSET ${skip}
    `;

    const [countRows, idRows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ count: number }[]>(countQuery),
      this.prisma.$queryRaw<{ id: string }[]>(idsQuery),
    ]);

    const ids = idRows.map((row) => row.id);
    const items = ids.length
      ? await this.prisma.p2PAllocation.findMany({
        where: { id: { in: ids } },
        include: {
          deposit: { include: { user: true } },
          withdrawal: { include: { user: true } },
        },
      })
      : [];

    const attachmentMap = await this.loadAllocationAttachments(items.map((item) => item.id));
    const itemMap = new Map(items.map((item) => [item.id, item]));

    return {
      items: ids
        .map((id) => itemMap.get(id))
        .filter(Boolean)
        .map((allocation) =>
          this.buildAllocationVm({
            allocation,
            attachments: attachmentMap.get(allocation!.id) ?? [],
            destinationMode: 'full',
            expiresSoonThreshold: expiringThreshold,
            actor: 'ADMIN',
          }),
        ),
      meta: this.paginationService.meta(countRows[0]?.count ?? 0, page, limit),
    };
  }

  async assignAllocations(
    withdrawalId: string,
    dto: { mode?: 'SYSTEM_DESTINATION'; destinationId?: string; amount?: string; candidateId?: string; depositId?: string; items?: { depositId: string; amount: string }[] },
    idempotencyKey?: string,
  ): Promise<AllocationVmDto[]> {
    const normalizedItems = this.normalizeAssignItems(dto);
    if (!normalizedItems.length) {
      throw new BadRequestException({ code: 'P2P_ASSIGN_INVALID', message: 'No allocation items provided.' });
    }

    const amounts = normalizedItems.map((item) => new Decimal(item.amount));
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
            return existing.responseJson as unknown as AllocationVmDto[];
          }
        }

        await this.lockWithdrawRow(tx, withdrawalId);
        const withdrawal = await tx.withdrawRequest.findUnique({ where: { id: withdrawalId } });
        if (!withdrawal) throw new NotFoundException('Withdraw not found');
        if (withdrawal.purpose !== RequestPurposeEnum.P2P) {
          throw new BadRequestException({ code: 'P2P_FORBIDDEN', message: 'Withdrawal is not P2P.' });
        }

        const depositIds = normalizedItems.map((item) => item.depositId);
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

        const destinationSnapshot = await this.resolveAssignmentDestinationSnapshot(withdrawal, dto);

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
          ]),
        );

        for (let idx = 0; idx < normalizedItems.length; idx += 1) {
          const item = normalizedItems[idx];
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
              destinationMode: 'full',
              actor: 'ADMIN',
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
      const threshold = this.getExpiringSoonThreshold(query.expiresSoon);
      where.expiresAt = { lte: threshold };
      const allowed = statusList
        ? statusList.filter((status) => status === P2PAllocationStatusEnum.ASSIGNED)
        : [P2PAllocationStatusEnum.ASSIGNED];
      where.status = { in: allowed as P2PAllocationStatus[] };
    }

    const { page, limit } = this.paginationService.resolvePaging({
      page: query.page,
      limit: query.limit,
      offset: query.offset,
    });
    const { skip, take } = this.paginationService.getSkipTake(page, limit);
    const payerSort = normalizeSort(
      {
        sort: query.sort,
        orderBy: query.orderBy,
        sortBy: query.sortBy,
        direction: query.direction,
        dir: query.dir,
        order: query.order,
      },
      { path: 'sort', allowedFields: ['createdAt', 'expiresAt', 'paidAt', 'amount'] },
    );
    const payerPrimary = payerSort[0];
    const orderBy: Prisma.P2PAllocationOrderByWithRelationInput[] = [
      { expiresAt: 'asc' },
    ];
    if (payerPrimary?.field === 'createdAt') orderBy.unshift({ createdAt: payerPrimary.direction });
    if (payerPrimary?.field === 'expiresAt') orderBy.unshift({ expiresAt: payerPrimary.direction });
    if (payerPrimary?.field === 'paidAt') orderBy.unshift({ payerPaidAt: payerPrimary.direction });
    if (payerPrimary?.field === 'amount') orderBy.unshift({ amount: payerPrimary.direction });

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
    const expiresSoonThreshold = this.getExpiringSoonThreshold(query.expiresSoon);

    return {
      items: items.map((allocation) =>
        this.buildAllocationVm({
          allocation,
          attachments: attachmentMap.get(allocation.id) ?? [],
          destinationMode: 'full',
          includePayerExtras: true,
          expiresSoonThreshold,
          actor: 'PAYER',
        }),
      ),
      meta: this.paginationService.meta(total, page, limit),
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

      if (
        [
          P2PAllocationStatusEnum.CANCELLED,
          P2PAllocationStatusEnum.EXPIRED,
          P2PAllocationStatusEnum.SETTLED,
          P2PAllocationStatusEnum.DISPUTED,
        ].includes(allocation.status)
      ) {
        throw new BadRequestException('Allocation is not assignable');
      }

      if (![P2PAllocationStatusEnum.ASSIGNED, P2PAllocationStatusEnum.PROOF_SUBMITTED].includes(allocation.status)) {
        throw new BadRequestException('Allocation is not assignable');
      }

      if (allocation.receiverConfirmedAt || allocation.adminVerifiedAt) {
        throw new BadRequestException('Allocation is not assignable');
      }

      if (allocation.status === P2PAllocationStatusEnum.ASSIGNED && this.allocationExpired(allocation)) {
        throw new BadRequestException({ code: 'P2P_ALLOCATION_EXPIRED', message: 'Allocation expired.' });
      }

      const proofAttempts = await tx.attachmentLink.count({
        where: {
          entityType: AttachmentLinkEntityType.P2P_ALLOCATION,
          entityId: allocation.id,
          kind: AttachmentLinkKind.P2P_PROOF,
        },
      });
      if (proofAttempts >= 2) {
        throw new BadRequestException({
          code: 'P2P_PROOF_MAX_ATTEMPTS_REACHED',
          message: 'Maximum proof attempts reached.',
        });
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
        destinationMode: 'full',
        includePayerExtras: true,
        actor: 'PAYER',
      });
    });
  }

  async listMyAllocationsAsReceiver(
    userId: string,
    query: P2PAllocationQueryDto,
  ): Promise<P2PListResponseDto<AllocationVmDto>> {
    const statusList = this.parseStatusFilter(query.status ?? 'PROOF_SUBMITTED');
    const where: Prisma.P2PAllocationWhereInput = {
      status: statusList ? { in: statusList as P2PAllocationStatus[] } : undefined,
      withdrawal: { userId },
    };

    if (query.expiresSoon) {
      const threshold = this.getExpiringSoonThreshold(query.expiresSoon);
      where.expiresAt = { lte: threshold };
      const allowed = statusList
        ? statusList.filter((status) => status === P2PAllocationStatusEnum.ASSIGNED)
        : [P2PAllocationStatusEnum.ASSIGNED];
      where.status = { in: allowed as P2PAllocationStatus[] };
    }

    const { page, limit } = this.paginationService.resolvePaging({
      page: query.page,
      limit: query.limit,
      offset: query.offset,
    });
    const { skip, take } = this.paginationService.getSkipTake(page, limit);
    const receiverSort = normalizeSort(
      {
        sort: query.sort,
        orderBy: query.orderBy,
        sortBy: query.sortBy,
        direction: query.direction,
        dir: query.dir,
        order: query.order,
      },
      { path: 'sort', allowedFields: ['paidAt', 'updatedAt', 'createdAt'] },
    );
    const receiverPrimary = receiverSort[0];
    const orderBy: Prisma.P2PAllocationOrderByWithRelationInput[] = [{ updatedAt: 'desc' }];
    if (receiverPrimary?.field === 'paidAt') orderBy.unshift({ payerPaidAt: receiverPrimary.direction });
    if (receiverPrimary?.field === 'createdAt') orderBy.unshift({ createdAt: receiverPrimary.direction });
    if (receiverPrimary?.field === 'updatedAt') orderBy.unshift({ updatedAt: receiverPrimary.direction });

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
    const expiresSoonThreshold = this.getExpiringSoonThreshold(query.expiresSoon);

    return {
      items: items.map((allocation) =>
        this.buildAllocationVm({
          allocation,
          attachments: attachmentMap.get(allocation.id) ?? [],
          destinationMode: 'full',
          expiresSoonThreshold,
          actor: 'RECEIVER',
        }),
      ),
      meta: this.paginationService.meta(total, page, limit),
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

      const confirmationMode = this.getConfirmationMode();
      if (confirmationMode === P2PConfirmationModeEnum.ADMIN) {
        throw new ForbiddenException({ code: 'P2P_FORBIDDEN', message: 'Receiver confirmation is not allowed for this allocation.' });
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
        destinationMode: 'full',
        actor: 'RECEIVER',
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
        destinationMode: 'full',
        actor: 'ADMIN',
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
          destinationMode: 'full',
          actor: 'ADMIN',
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

      if (allocation.status === P2PAllocationStatusEnum.ASSIGNED && this.allocationExpired(allocation)) {
        throw new BadRequestException({ code: 'P2P_ALLOCATION_EXPIRED', message: 'Allocation expired.' });
      }

      this.ensureFinalizable(allocation);

      if (allocation.withdrawerAccountTxId || allocation.payerAccountTxId) {
        const current = await tx.p2PAllocation.findUnique({
          where: { id: allocationId },
          include: { withdrawal: { include: { user: true } }, deposit: { include: { user: true } } },
        });
        const attachments = await this.loadAllocationAttachments([allocationId]);
        return this.buildAllocationVm({
          allocation: current,
          attachments: attachments.get(allocationId) ?? [],
          destinationMode: 'full',
          actor: 'ADMIN',
        });
      }

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
        destinationMode: 'full',
        actor: 'ADMIN',
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
          destinationMode: 'full',
          actor: 'ADMIN',
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
        destinationMode: 'full',
        actor: 'ADMIN',
      });
    });
  }


  async listAdminSystemDestinations(): Promise<AdminP2PSystemDestinationListDto> {
    const rows = await this.paymentDestinationsService.listSystemCollectionDestinations(false);
    return {
      items: rows.map((item) => ({
        id: item.id,
        title: item.title,
        bankName: item.bankName,
        ownerName: item.ownerName,
        masked: item.fullValue,
        fullValue: item.fullValue,
        copyText: this.buildDestinationCopyText({ title: item.title, bankName: item.bankName, ownerName: item.ownerName, value: item.fullValue }) ?? item.fullValue,
        isActive: item.isActive,
      })),
    };
  }

  async getAdminAllocationDetail(id: string): Promise<AdminP2PAllocationDetailVmDto> {
    const allocation = await this.prisma.p2PAllocation.findUnique({
      where: { id },
      include: { deposit: { include: { user: true } }, withdrawal: { include: { user: true } } },
    });
    if (!allocation) throw new NotFoundException('Allocation not found');
    const attachmentMap = await this.loadAllocationAttachments([allocation.id]);
    return this.buildAllocationVm({ allocation, attachments: attachmentMap.get(allocation.id) ?? [], destinationMode: 'full', actor: 'ADMIN' });
  }

  async getAdminWithdrawalDetail(id: string): Promise<AdminP2PWithdrawalDetailVmDto> {
    const withdrawal = await this.prisma.withdrawRequest.findUnique({ where: { id } });
    if (!withdrawal) throw new NotFoundException('Withdraw not found');
    if (withdrawal.purpose !== RequestPurposeEnum.P2P) throw new BadRequestException({ code: 'P2P_FORBIDDEN', message: 'Withdrawal is not P2P.' });

    const allocations = await this.prisma.p2PAllocation.findMany({
      where: { withdrawalId: id },
      include: { deposit: { include: { user: true } }, withdrawal: { include: { user: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const attachmentMap = await this.loadAllocationAttachments(allocations.map((a) => a.id));
    const allocationVms = allocations.map((allocation) => this.buildAllocationVm({ allocation, attachments: attachmentMap.get(allocation.id) ?? [], destinationMode: 'full', actor: 'ADMIN' }));

    const vm = this.buildWithdrawalVm({
      ...withdrawal,
      flags: {
        hasDispute: allocations.some((a) => a.status === P2PAllocationStatusEnum.DISPUTED),
        hasProof: allocations.some((a) => a.proofSubmittedAt != null),
        hasExpiringAllocations: allocations.some((a) => a.status === P2PAllocationStatusEnum.ASSIGNED && this.allocationExpiresSoon(a)),
      },
    });

    return {
      ...vm,
      assignedAmount: withdrawal.assignedAmountTotal.toString(),
      remainingToAssign: subDec(withdrawal.amount, withdrawal.assignedAmountTotal).toString(),
      allocations: allocationVms,
      allowedActions: [
        { key: 'ASSIGN', enabled: vm.actions.canAssign, reasonDisabled: vm.actions.canAssign ? undefined : 'Withdrawal cannot be assigned in current status.' },
        { key: 'CANCEL', enabled: vm.actions.canCancel, reasonDisabled: vm.actions.canCancel ? undefined : 'Withdrawal cannot be cancelled in current status.' },
      ],
      timeline: [{ key: 'ASSIGNED', at: withdrawal.createdAt.toISOString(), byRole: 'SYSTEM' }],
      riskFlags: [
        ...(allocations.some((a) => a.status === P2PAllocationStatusEnum.DISPUTED) ? ['HAS_DISPUTE'] : []),
        ...(subDec(withdrawal.amount, withdrawal.assignedAmountTotal).gt(0) ? ['UNASSIGNED_REMAINING'] : []),
      ],
    };
  }

  async getOpsSummary() {
    const expiringThreshold = this.getExpiringSoonThreshold('60');
    const finalizableWhere = this.buildOpsFinalizableWhere();
    const [
      withdrawalsWaitingAssignmentCountRows,
      withdrawalsPartiallyAssignedCountRows,
      allocationsExpiringSoonCount,
      allocationsProofSubmittedCount,
      allocationsDisputedCount,
      allocationsFinalizableCount,
    ] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "WithdrawRequest" w
        WHERE w."purpose" = ${RequestPurposeEnum.P2P}::"RequestPurpose"
          AND w."assignedAmountTotal" = 0
          AND (w."amount" - w."assignedAmountTotal") > 0
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "WithdrawRequest" w
        WHERE w."purpose" = ${RequestPurposeEnum.P2P}::"RequestPurpose"
          AND w."assignedAmountTotal" > 0
          AND w."assignedAmountTotal" < w."amount"
      `),
      this.prisma.p2PAllocation.count({
        where: {
          status: { in: [P2PAllocationStatusEnum.ASSIGNED] },
          expiresAt: { lte: expiringThreshold },
        },
      }),
      this.prisma.p2PAllocation.count({
        where: { status: P2PAllocationStatusEnum.PROOF_SUBMITTED },
      }),
      this.prisma.p2PAllocation.count({
        where: { status: P2PAllocationStatusEnum.DISPUTED },
      }),
      this.prisma.p2PAllocation.count({ where: finalizableWhere }),
    ]);

    return {
      withdrawalsWaitingAssignmentCount: withdrawalsWaitingAssignmentCountRows[0]?.count ?? 0,
      withdrawalsPartiallyAssignedCount: withdrawalsPartiallyAssignedCountRows[0]?.count ?? 0,
      allocationsExpiringSoonCount,
      allocationsProofSubmittedCount,
      allocationsDisputedCount,
      allocationsFinalizableCount,
    };
  }

  async expireAllocations(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.p2PAllocation.findMany({
      where: {
        expiresAt: { lt: now },
        status: { in: [P2PAllocationStatusEnum.ASSIGNED] },
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
        if (![P2PAllocationStatusEnum.ASSIGNED].includes(allocation.status)) {
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
