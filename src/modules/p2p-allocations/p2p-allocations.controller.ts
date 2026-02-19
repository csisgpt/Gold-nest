import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import {
  AdminP2PAllocationsQueryDto,
  AdminP2PWithdrawalCandidatesQueryDto,
  AdminP2PWithdrawalsQueryDto,
  AdminP2PAllocationDetailVmDto,
  AdminP2PSystemDestinationListDto,
  AdminP2PWithdrawalDetailVmDto,
  AllocationVmDto,
  CreateAdminP2PSystemDestinationDto,
  DepositVmDto,
  P2PAdminVerifyDto,
  P2PAllocationProofDto,
  P2PAllocationQueryDto,
  P2PAssignRequestDto,
  P2PListResponseDto,
  P2POpsSummaryDto,
  P2PReceiverConfirmDto,
  SetAdminP2PSystemDestinationStatusDto,
  UpdateAdminP2PSystemDestinationDto,
  WithdrawalVmDto,
} from './dto/p2p-allocations.dto';
import { P2PAllocationsService } from './p2p-allocations.service';

@ApiTags('p2p-allocations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class P2PAllocationsController {
  constructor(private readonly p2pService: P2PAllocationsService) {}

  @Get('admin/p2p/withdrawals')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({
    type: P2PListResponseDto<WithdrawalVmDto>,
    description: 'List of P2P withdrawals (enveloped).',
    content: {
      'application/json': {
        example: {
          ok: true,
          result: {
            items: [],
            meta: {
              page: 1,
              limit: 20,
              totalItems: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPrevPage: false,
            },
          },
          traceId: 'req_1234567890',
          ts: '2024-01-01T00:00:00.000Z',
        },
      },
    },
  })
  listAdminWithdrawals(
    @Query() query: AdminP2PWithdrawalsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.markDeprecatedOffset(query, res);
    return this.p2pService.listAdminWithdrawals(query);
  }

  @Get('admin/p2p/withdrawals/:id')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminP2PWithdrawalDetailVmDto })
  getAdminWithdrawalDetail(@Param('id') id: string) {
    return this.p2pService.getAdminWithdrawalDetail(id);
  }

  @Get('admin/p2p/withdrawals/:id/candidates')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: P2PListResponseDto<DepositVmDto> })
  listCandidates(
    @Param('id') id: string,
    @Query() query: AdminP2PWithdrawalCandidatesQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.markDeprecatedOffset(query, res);
    return this.p2pService.listCandidates(id, query);
  }

  @Post('admin/p2p/withdrawals/:id/assign')
  @Roles(UserRole.ADMIN)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOkResponse({ type: [AllocationVmDto] })
  assignAllocations(
    @Param('id') id: string,
    @Body() dto: P2PAssignRequestDto,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    const key = headers?.['idempotency-key'] ?? headers?.['x-idempotency-key'];
    return this.p2pService.assignAllocations(id, dto, key);
  }

  @Get('admin/p2p/system-destinations')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminP2PSystemDestinationListDto })
  listSystemDestinations() {
    return this.p2pService.listAdminSystemDestinations();
  }



  @Post('admin/p2p/system-destinations')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminP2PSystemDestinationListDto })
  createSystemDestination(@Body() dto: CreateAdminP2PSystemDestinationDto) {
    return this.p2pService.createAdminSystemDestination(dto);
  }

  @Patch('admin/p2p/system-destinations/:id')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminP2PSystemDestinationListDto })
  updateSystemDestination(@Param('id') id: string, @Body() dto: UpdateAdminP2PSystemDestinationDto) {
    return this.p2pService.updateAdminSystemDestination(id, dto);
  }

  @Patch('admin/p2p/system-destinations/:id/status')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminP2PSystemDestinationListDto })
  setSystemDestinationStatus(@Param('id') id: string, @Body() dto: SetAdminP2PSystemDestinationStatusDto) {
    return this.p2pService.setAdminSystemDestinationStatus(id, dto);
  }

  @Get('admin/p2p/allocations/:id')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminP2PAllocationDetailVmDto })
  getAdminAllocationDetail(@Param('id') id: string) {
    return this.p2pService.getAdminAllocationDetail(id);
  }

  @Get('admin/p2p/allocations')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: P2PListResponseDto<AllocationVmDto> })
  listAdminAllocations(
    @Query() query: AdminP2PAllocationsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.markDeprecatedOffset(query, res);
    return this.p2pService.listAdminAllocations(query);
  }

  @Get('admin/p2p/ops-summary')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: P2POpsSummaryDto, description: 'Operational summary for P2P flows.' })
  getOpsSummary() {
    return this.p2pService.getOpsSummary();
  }

  @Post('admin/p2p/allocations/:id/verify')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AllocationVmDto })
  verifyAllocation(@Param('id') id: string, @Body() dto: P2PAdminVerifyDto, @CurrentUser() admin: JwtRequestUser) {
    return this.p2pService.adminVerify(id, admin.id, dto.approved, dto.note);
  }

  @Post('admin/p2p/allocations/:id/finalize')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AllocationVmDto })
  finalizeAllocation(@Param('id') id: string, @CurrentUser() admin: JwtRequestUser) {
    return this.p2pService.finalizeAllocation(id, admin.id);
  }

  @Post('admin/p2p/allocations/:id/cancel')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AllocationVmDto })
  cancelAllocation(@Param('id') id: string) {
    return this.p2pService.cancelAllocation(id);
  }

  @Get('p2p/allocations/my-as-payer')
  @ApiOkResponse({ type: P2PListResponseDto<AllocationVmDto> })
  listMyAsPayer(
    @CurrentUser() user: JwtRequestUser,
    @Query() query: P2PAllocationQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.markDeprecatedOffset(query, res);
    return this.p2pService.listMyAllocationsAsPayer(user.id, query);
  }

  @Post('p2p/allocations/:id/proof')
  @ApiOkResponse({ type: AllocationVmDto })
  submitProof(
    @Param('id') id: string,
    @CurrentUser() user: JwtRequestUser,
    @Body() dto: P2PAllocationProofDto,
  ) {
    return this.p2pService.submitPayerProof(id, user.id, dto);
  }

  @Get('p2p/allocations/my-as-receiver')
  @ApiOkResponse({ type: P2PListResponseDto<AllocationVmDto> })
  listMyAsReceiver(
    @CurrentUser() user: JwtRequestUser,
    @Query() query: P2PAllocationQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.markDeprecatedOffset(query, res);
    return this.p2pService.listMyAllocationsAsReceiver(user.id, query);
  }

  @Post('p2p/allocations/:id/receiver-confirm')
  @ApiOkResponse({ type: AllocationVmDto })
  receiverConfirm(
    @Param('id') id: string,
    @CurrentUser() user: JwtRequestUser,
    @Body() dto: P2PReceiverConfirmDto,
  ) {
    return this.p2pService.receiverConfirm(id, user.id, { confirmed: dto.confirmed, reason: dto.reason });
  }

  private markDeprecatedOffset(query: { offset?: number; page?: number }, res: Response) {
    if (query.offset !== undefined && query.page === undefined) {
      res.setHeader('X-Deprecated', 'offset');
    }
  }
}
