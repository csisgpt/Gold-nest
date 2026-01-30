import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsISO8601, IsNumberString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { P2PAllocationStatus } from '@prisma/client';
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

export enum P2PWithdrawalAdminStatus {
  WAITING_MATCH = 'WAITING_MATCH',
  PARTIAL = 'PARTIAL',
  SETTLED = 'SETTLED',
}

export class AdminP2PWithdrawalsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: P2PWithdrawalAdminStatus })
  @IsOptional()
  @IsEnum(P2PWithdrawalAdminStatus)
  status?: P2PWithdrawalAdminStatus;
}

export class P2PWithdrawalAdminListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userSummary!: Record<string, any>;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  assignedTotal!: string;

  @ApiProperty()
  settledTotal!: string;

  @ApiProperty()
  remainingToAssign!: string;

  @ApiProperty()
  remainingToSettle!: string;

  @ApiPropertyOptional({ nullable: true })
  destinationMasked?: string | null;

  @ApiProperty({ enum: P2PWithdrawalAdminStatus })
  status!: P2PWithdrawalAdminStatus;

  @ApiProperty()
  createdAt!: Date;
}

export class P2PWithdrawalCandidatesItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userSummary!: Record<string, any>;

  @ApiProperty()
  requestedAmount!: string;

  @ApiProperty()
  remainingAmount!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class P2PAssignItemDto {
  @ApiProperty()
  @IsString()
  depositId!: string;

  @ApiProperty({ description: 'Assigned amount as decimal string.' })
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

export class P2PAllocationAdminViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  withdrawalId!: string;

  @ApiProperty()
  depositId!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ enum: P2PAllocationStatusEnum })
  status!: P2PAllocationStatus;

  @ApiProperty()
  paymentCode!: string;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  destinationSnapshot!: Record<string, any>;

  @ApiPropertyOptional({ nullable: true })
  payerBankRef?: string | null;

  @ApiPropertyOptional({ nullable: true })
  payerProofFileId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  payerPaidAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class P2PAllocationPayerViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ enum: P2PAllocationStatusEnum })
  status!: P2PAllocationStatus;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  paymentCode!: string;

  @ApiProperty()
  destinationToPay!: Record<string, any>;

  @ApiProperty()
  withdrawalRef!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class P2PAllocationReceiverViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ enum: P2PAllocationStatusEnum })
  status!: P2PAllocationStatus;

  @ApiProperty()
  payerSummary!: Record<string, any>;

  @ApiPropertyOptional({ nullable: true })
  bankRef?: string | null;

  @ApiPropertyOptional({ nullable: true })
  proofFileId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  paidAt?: Date | null;

  @ApiProperty()
  paymentCode!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class P2PAllocationProofDto {
  @ApiProperty()
  @IsString()
  bankRef!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proofFileId?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp when payment was made.' })
  @IsOptional()
  @IsISO8601()
  paidAt?: string;
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

export class P2PAllocationQueryDto {
  @ApiPropertyOptional({ enum: P2PAllocationStatusEnum })
  @IsOptional()
  @IsEnum(P2PAllocationStatusEnum)
  status?: P2PAllocationStatus;
}
