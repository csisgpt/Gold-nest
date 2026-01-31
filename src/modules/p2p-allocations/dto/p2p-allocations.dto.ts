import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumberString,
  IsOptional,
  IsString,
  IsInt,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentDestinationType, PaymentMethod, P2PAllocationStatus, WithdrawStatus, DepositStatus } from '@prisma/client';
import { ListQueryDto } from '../../../common/pagination/dto/list-query.dto';

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

const integerStringPattern = /^\d+$/;

export enum P2PWithdrawalListSort {
  CREATED_AT_DESC = 'createdAt_desc',
  CREATED_AT_ASC = 'createdAt_asc',
  AMOUNT_DESC = 'amount_desc',
  AMOUNT_ASC = 'amount_asc',
  REMAINING_DESC = 'remainingToAssign_desc',
  REMAINING_ASC = 'remainingToAssign_asc',
  PRIORITY = 'priority',
  NEAREST_EXPIRE_ASC = 'nearestExpire_asc',
}

export enum P2PCandidateSort {
  REMAINING_DESC = 'remaining_desc',
  CREATED_AT_ASC = 'createdAt_asc',
  CREATED_AT_DESC = 'createdAt_desc',
}

export enum P2PAllocationSort {
  CREATED_AT_DESC = 'createdAt_desc',
  EXPIRES_AT_ASC = 'expiresAt_asc',
  PAID_AT_DESC = 'paidAt_desc',
  AMOUNT_DESC = 'amount_desc',
}

export class AdminP2PWithdrawalsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated status list' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  @Matches(integerStringPattern)
  amountMin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  @Matches(integerStringPattern)
  amountMax?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  @Matches(integerStringPattern)
  remainingToAssignMin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  @Matches(integerStringPattern)
  remainingToAssignMax?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destinationBank?: string;

  @ApiPropertyOptional({ enum: PaymentDestinationTypeEnum })
  @IsOptional()
  @IsEnum(PaymentDestinationTypeEnum)
  destinationType?: PaymentDestinationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasDispute?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasProof?: boolean;

  @ApiPropertyOptional({ description: 'Allocation expiring within N minutes.' })
  @IsOptional()
  @IsNumberString()
  expiringSoonMinutes?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ enum: P2PWithdrawalListSort })
  @IsOptional()
  @IsEnum(P2PWithdrawalListSort)
  sort?: P2PWithdrawalListSort;
}

export class AdminP2PWithdrawalCandidatesQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated status list' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  @Matches(integerStringPattern)
  remainingMin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({ description: 'Exclude a specific user from candidates.' })
  @IsOptional()
  @IsString()
  excludeUserId?: string;

  @ApiPropertyOptional({ enum: P2PCandidateSort })
  @IsOptional()
  @IsEnum(P2PCandidateSort)
  sort?: P2PCandidateSort;
}

export class AdminP2PAllocationsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated status list' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  withdrawalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  depositId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payerUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiverUserId?: string;

  @ApiPropertyOptional({ enum: PaymentMethodEnum })
  @IsOptional()
  @IsEnum(PaymentMethodEnum)
  method?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasProof?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  receiverConfirmed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  adminVerified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  expired?: boolean;

  @ApiPropertyOptional({ description: 'Allocation expiring within N minutes.' })
  @IsOptional()
  @IsNumberString()
  expiresSoonMinutes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankRefSearch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  paidFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  paidTo?: string;

  @ApiPropertyOptional({ enum: P2PAllocationSort })
  @IsOptional()
  @IsEnum(P2PAllocationSort)
  sort?: P2PAllocationSort;
}

export class P2PAllocationQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated status list' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  expiresSoon?: string;

  @ApiPropertyOptional({ enum: P2PAllocationSort })
  @IsOptional()
  @IsEnum(P2PAllocationSort)
  sort?: P2PAllocationSort;
}

export class P2PAssignItemDto {
  @ApiProperty()
  @IsString()
  depositId!: string;

  @ApiProperty({ description: 'Assigned amount as integer string.' })
  @IsNumberString()
  amount!: string;
}

export class P2PAssignRequestDto {
  @ApiProperty({ type: [P2PAssignItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => P2PAssignItemDto)
  items!: P2PAssignItemDto[];
}

export class P2PAllocationProofDto {
  @ApiProperty()
  @IsString()
  bankRef!: string;

  @ApiProperty({ enum: PaymentMethodEnum })
  @IsEnum(PaymentMethodEnum)
  method!: PaymentMethod;

  @ApiPropertyOptional({ description: 'ISO timestamp when payment was made.' })
  @IsOptional()
  @IsISO8601()
  paidAt?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  fileIds!: string[];
}

export class P2PReceiverConfirmDto {
  @ApiProperty()
  @IsBoolean()
  confirmed!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class P2PAdminVerifyDto {
  @ApiProperty()
  @IsBoolean()
  approved!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class P2PListMetaDto {
  @ApiPropertyOptional()
  total?: number;

  @ApiPropertyOptional()
  nextCursor?: string | null;

  @ApiProperty()
  limit!: number;

  @ApiPropertyOptional()
  offset?: number;

  @ApiPropertyOptional()
  sort?: string;

  @ApiPropertyOptional()
  filtersApplied?: Record<string, any>;
}

export class P2PListResponseDto<T> {
  @ApiProperty({ isArray: true })
  data!: T[];

  @ApiProperty({ type: () => P2PListMetaDto })
  meta!: P2PListMetaDto;
}

export class WithdrawalTotalsDto {
  @ApiProperty()
  assigned!: string;

  @ApiProperty()
  settled!: string;

  @ApiProperty()
  remainingToAssign!: string;

  @ApiProperty()
  remainingToSettle!: string;
}

export class WithdrawalActionsDto {
  @ApiProperty()
  canCancel!: boolean;

  @ApiProperty()
  canAssign!: boolean;

  @ApiProperty()
  canViewAllocations!: boolean;
}

export class WithdrawalDestinationDto {
  @ApiProperty({ enum: PaymentDestinationTypeEnum })
  type!: PaymentDestinationType;

  @ApiProperty()
  masked!: string;

  @ApiPropertyOptional({ nullable: true })
  bankName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  title?: string | null;
}

export class WithdrawalVmDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  purpose!: string;

  @ApiPropertyOptional({ nullable: true })
  channel?: string | null;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ enum: WithdrawStatus })
  status!: WithdrawStatus;

  @ApiProperty({ type: () => WithdrawalTotalsDto })
  totals!: WithdrawalTotalsDto;

  @ApiPropertyOptional({ type: () => WithdrawalDestinationDto, nullable: true })
  destination?: WithdrawalDestinationDto | null;

  @ApiProperty({
    description: 'Computed flags for ops UI.',
    type: () => WithdrawalFlagsDto,
  })
  flags!: WithdrawalFlagsDto;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: () => WithdrawalActionsDto })
  actions!: WithdrawalActionsDto;
}

export class DepositTotalsDto {
  @ApiProperty()
  assigned!: string;

  @ApiProperty()
  settled!: string;

  @ApiProperty()
  remaining!: string;
}

export class DepositActionsDto {
  @ApiProperty()
  canCancel!: boolean;

  @ApiProperty()
  canBeAssigned!: boolean;
}

export class DepositVmDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  purpose!: string;

  @ApiProperty()
  requestedAmount!: string;

  @ApiProperty({ enum: DepositStatus })
  status!: DepositStatus;

  @ApiProperty({ type: () => DepositTotalsDto })
  totals!: DepositTotalsDto;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: () => DepositActionsDto })
  actions!: DepositActionsDto;

  @ApiProperty({ type: () => DepositFlagsDto })
  flags!: DepositFlagsDto;
}

export class AllocationPaymentDto {
  @ApiProperty({ enum: PaymentMethodEnum })
  method!: PaymentMethod;

  @ApiPropertyOptional({ nullable: true })
  bankRef?: string | null;

  @ApiPropertyOptional({ nullable: true })
  paidAt?: Date | null;
}

export class AllocationAttachmentFileDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  mime!: string;

  @ApiProperty()
  size!: number;
}

export class AllocationAttachmentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  kind!: string;

  @ApiProperty({ type: () => AllocationAttachmentFileDto })
  file!: AllocationAttachmentFileDto;

  @ApiProperty()
  createdAt!: Date;
}

export class AllocationDestinationDto {
  @ApiProperty({ enum: PaymentDestinationTypeEnum })
  type!: PaymentDestinationType;

  @ApiPropertyOptional({ nullable: true })
  bankName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  ownerName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  title?: string | null;

  @ApiPropertyOptional({ nullable: true })
  fullValue?: string | null;

  @ApiProperty()
  masked!: string;
}

export class AllocationTimestampDto {
  @ApiPropertyOptional({ nullable: true })
  proofSubmittedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  receiverConfirmedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  adminVerifiedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  settledAt?: Date | null;
}

export class AllocationActionsDto {
  @ApiProperty()
  payerCanSubmitProof!: boolean;

  @ApiProperty()
  receiverCanConfirm!: boolean;

  @ApiProperty()
  adminCanFinalize!: boolean;
}

export class AllocationUserSummaryDto {
  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional({ nullable: true })
  mobile?: string | null;

  @ApiPropertyOptional({ nullable: true })
  displayName?: string | null;
}

export class AllocationVmDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  withdrawalId!: string;

  @ApiProperty()
  depositId!: string;

  @ApiProperty({ type: () => AllocationUserSummaryDto })
  payer!: AllocationUserSummaryDto;

  @ApiProperty({ type: () => AllocationUserSummaryDto })
  receiver!: AllocationUserSummaryDto;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ enum: P2PAllocationStatusEnum })
  status!: P2PAllocationStatus;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  paymentCode!: string;

  @ApiProperty({ type: () => AllocationPaymentDto })
  payment!: AllocationPaymentDto;

  @ApiProperty({ type: [AllocationAttachmentDto] })
  attachments!: AllocationAttachmentDto[];

  @ApiPropertyOptional({ type: () => AllocationDestinationDto, nullable: true })
  destinationToPay?: AllocationDestinationDto | null;

  @ApiPropertyOptional()
  expiresInSeconds?: number;

  @ApiPropertyOptional()
  destinationCopyText?: string;

  @ApiProperty({ type: () => AllocationTimestampDto })
  timestamps!: AllocationTimestampDto;

  @ApiProperty({ type: () => AllocationFlagsDto })
  flags!: AllocationFlagsDto;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: () => AllocationActionsDto })
  actions!: AllocationActionsDto;
}

export class WithdrawalFlagsDto {
  @ApiProperty()
  hasDispute!: boolean;

  @ApiProperty()
  hasProof!: boolean;

  @ApiProperty()
  hasExpiringAllocations!: boolean;

  @ApiProperty()
  isUrgent!: boolean;
}

export class DepositFlagsDto {
  @ApiProperty()
  isFullyAvailable!: boolean;

  @ApiProperty()
  isExpiring!: boolean;
}

export class AllocationFlagsDto {
  @ApiProperty()
  isExpired!: boolean;

  @ApiProperty()
  expiresSoon!: boolean;

  @ApiProperty()
  hasProof!: boolean;

  @ApiProperty()
  isFinalizable!: boolean;
}

export class P2POpsSummaryDto {
  @ApiProperty()
  withdrawalsWaitingAssignmentCount!: number;

  @ApiProperty()
  withdrawalsPartiallyAssignedCount!: number;

  @ApiProperty()
  allocationsExpiringSoonCount!: number;

  @ApiProperty()
  allocationsProofSubmittedCount!: number;

  @ApiProperty()
  allocationsDisputedCount!: number;

  @ApiProperty()
  allocationsFinalizableCount!: number;
}
