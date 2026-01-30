import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import {
  AdminP2PWithdrawalsQueryDto,
  P2PAllocationAdminViewDto,
  P2PAllocationPayerViewDto,
  P2PAllocationProofDto,
  P2PAllocationQueryDto,
  P2PAllocationReceiverViewDto,
  P2PAssignRequestDto,
  P2PReceiverConfirmDto,
  P2PAdminVerifyDto,
  P2PWithdrawalCandidatesItemDto,
  P2PWithdrawalAdminListItemDto,
} from './dto/p2p-allocations.dto';
import { P2PAllocationsService } from './p2p-allocations.service';
import { PaginatedResponseDto, PaginationMetaDto } from '../../common/pagination/dto/pagination-meta.dto';
import { ApiProperty } from '@nestjs/swagger';

class PaginatedP2PWithdrawalResponseDto extends PaginatedResponseDto<P2PWithdrawalAdminListItemDto> {
  @ApiProperty({ type: [P2PWithdrawalAdminListItemDto] })
  items!: P2PWithdrawalAdminListItemDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta!: PaginationMetaDto;
}

@ApiTags('p2p-allocations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class P2PAllocationsController {
  constructor(private readonly p2pService: P2PAllocationsService) {}

  @Get('admin/p2p/withdrawals')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: PaginatedP2PWithdrawalResponseDto })
  listAdminWithdrawals(@Query() query: AdminP2PWithdrawalsQueryDto) {
    return this.p2pService.listAdminWithdrawals(query);
  }

  @Get('admin/p2p/withdrawals/:id/candidates')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: [P2PWithdrawalCandidatesItemDto] })
  listCandidates(@Param('id') id: string) {
    return this.p2pService.listCandidates(id);
  }

  @Post('admin/p2p/withdrawals/:id/assign')
  @Roles(UserRole.ADMIN)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOkResponse({ type: [P2PAllocationAdminViewDto] })
  assignAllocations(
    @Param('id') id: string,
    @Body() dto: P2PAssignRequestDto,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    const key = headers?.['idempotency-key'] ?? headers?.['x-idempotency-key'];
    return this.p2pService.assignAllocations(id, dto, key);
  }

  @Post('admin/p2p/allocations/:id/verify')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: P2PAllocationAdminViewDto })
  verifyAllocation(@Param('id') id: string, @Body() dto: P2PAdminVerifyDto, @CurrentUser() admin: JwtRequestUser) {
    return this.p2pService.adminVerify(id, admin.id, dto.approved);
  }

  @Post('admin/p2p/allocations/:id/finalize')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: P2PAllocationAdminViewDto })
  finalizeAllocation(@Param('id') id: string, @CurrentUser() admin: JwtRequestUser) {
    return this.p2pService.finalizeAllocation(id, admin.id);
  }

  @Post('admin/p2p/allocations/:id/cancel')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: P2PAllocationAdminViewDto })
  cancelAllocation(@Param('id') id: string) {
    return this.p2pService.cancelAllocation(id);
  }

  @Get('p2p/allocations/my-as-payer')
  @ApiOkResponse({ type: [P2PAllocationPayerViewDto] })
  listMyAsPayer(@CurrentUser() user: JwtRequestUser, @Query() query: P2PAllocationQueryDto) {
    return this.p2pService.listMyAllocationsAsPayer(user.id, query.status);
  }

  @Post('p2p/allocations/:id/proof')
  @ApiOkResponse({ type: P2PAllocationPayerViewDto })
  submitProof(
    @Param('id') id: string,
    @CurrentUser() user: JwtRequestUser,
    @Body() dto: P2PAllocationProofDto,
  ) {
    return this.p2pService.submitPayerProof(id, user.id, {
      bankRef: dto.bankRef,
      proofFileId: dto.proofFileId,
      paidAt: dto.paidAt,
    });
  }

  @Get('p2p/allocations/my-as-receiver')
  @ApiOkResponse({ type: [P2PAllocationReceiverViewDto] })
  listMyAsReceiver(@CurrentUser() user: JwtRequestUser, @Query() query: P2PAllocationQueryDto) {
    return this.p2pService.listMyAllocationsAsReceiver(user.id, query.status);
  }

  @Post('p2p/allocations/:id/receiver-confirm')
  @ApiOkResponse({ type: P2PAllocationReceiverViewDto })
  receiverConfirm(
    @Param('id') id: string,
    @CurrentUser() user: JwtRequestUser,
    @Body() dto: P2PReceiverConfirmDto,
  ) {
    return this.p2pService.receiverConfirm(id, user.id, { confirmed: dto.confirmed, reason: dto.reason });
  }
}
