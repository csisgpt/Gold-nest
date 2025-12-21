import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AccountTxType,
  AttachmentEntityType,
  PolicyAction,
  PolicyMetric,
  PolicyPeriod,
  TxRefType,
  WithdrawRequest,
  WithdrawStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { FilesService } from '../files/files.service';
import { IRR_INSTRUMENT_CODE } from '../accounts/constants';
import { DecisionDto } from '../deposits/dto/decision.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { InsufficientCreditException } from '../../common/exceptions/insufficient-credit.exception';
import { TahesabOutboxService } from '../tahesab/tahesab-outbox.service';
import { TahesabIntegrationConfigService } from '../tahesab/tahesab-integration.config';
import { SabteKolOrMovaghat } from '../tahesab/tahesab.methods';
import { SimpleVoucherDto } from '../tahesab/tahesab-documents.service';
import { runInTx } from '../../common/db/tx.util';
import { withdrawalWithUserSelect, WithdrawalWithUser, WithdrawalsMapper } from './withdrawals.mapper';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { PaginationService } from '../../common/pagination/pagination.service';
import { AdminListWithdrawalsDto } from './dto/admin-list-withdrawals.dto';
import {
  AdminWithdrawalsMapper,
  adminWithdrawalSelect,
  adminWithdrawalAttachmentWhere,
} from './withdrawals.admin.mapper';
import { AdminWithdrawalDetailDto } from './dto/response/admin-withdrawal-detail.dto';
import { LimitsService } from '../policy/limits.service';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly limitsService: LimitsService,
    private readonly filesService: FilesService,
    private readonly tahesabOutbox: TahesabOutboxService,
    private readonly tahesabIntegration: TahesabIntegrationConfigService,
    private readonly paginationService: PaginationService,
  ) {}

  async createForUser(user: JwtRequestUser, dto: CreateWithdrawalDto, idempotencyKey?: string) {
    const amountDecimal = new Decimal(dto.amount);
    if (amountDecimal.lte(0)) {
      throw new BadRequestException('Withdrawal amount must be positive');
    }

    return runInTx(
      this.prisma,
      async (tx) => {
        const account = await this.accountsService.getOrCreateAccount(user.id, IRR_INSTRUMENT_CODE, tx);

        if (idempotencyKey) {
          const existing = await tx.withdrawRequest.findFirst({
            where: { userId: user.id, idempotencyKey },
            select: withdrawalWithUserSelect,
          });
          if (existing) {
            this.logger.debug(`Reusing idempotent withdrawal request ${existing.id} for user ${user.id}`);
            return existing as WithdrawalWithUser;
          }
        }

        const usable = this.accountsService.getUsableCapacity(account);
        if (usable.lt(amountDecimal)) {
          throw new BadRequestException('Insufficient capacity for withdrawal');
        }

        const withdraw = await tx.withdrawRequest.create({
          data: {
            userId: user.id,
            amount: amountDecimal,
            bankName: dto.bankName,
            iban: dto.iban,
            cardNumber: dto.cardNumber,
            note: dto.note,
            idempotencyKey,
          },
        });

        await this.limitsService.reserve(
          {
            userId: user.id,
            action: PolicyAction.WITHDRAW_IRR,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.DAILY,
            amount: amountDecimal,
            instrumentKey: 'ALL',
            refType: TxRefType.WITHDRAW,
            refId: withdraw.id,
          },
          tx,
        );

        await this.limitsService.reserve(
          {
            userId: user.id,
            action: PolicyAction.WITHDRAW_IRR,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.MONTHLY,
            amount: amountDecimal,
            instrumentKey: 'ALL',
            refType: TxRefType.WITHDRAW,
            refId: withdraw.id,
          },
          tx,
        );

        await this.accountsService.reserveFunds({
          userId: user.id,
          instrumentCode: IRR_INSTRUMENT_CODE,
          amount: amountDecimal,
          refType: TxRefType.WITHDRAW,
          refId: withdraw.id,
          tx,
        });

        await this.filesService.createAttachmentsForActor(
          { id: user.id, role: user.role },
          dto.fileIds,
          AttachmentEntityType.WITHDRAW,
          withdraw.id,
          tx,
        );

        this.logger.log(`Withdrawal ${withdraw.id} created for user ${user.id}`);

        return tx.withdrawRequest.findUnique({ where: { id: withdraw.id }, select: withdrawalWithUserSelect });
      },
      { logger: this.logger },
    );
  }

  findMy(userId: string) {
    return this.prisma.withdrawRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByStatus(status?: WithdrawStatus) {
    const withdrawals = await this.prisma.withdrawRequest.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      select: withdrawalWithUserSelect,
    });

    return WithdrawalsMapper.toResponses(withdrawals as WithdrawalWithUser[]);
  }

  async listAdmin(query: AdminListWithdrawalsDto) {
    const { skip, take, page, limit } = this.paginationService.getSkipTake(query.page, query.limit);

    const where = {
      status: query.status,
      userId: query.userId,
      amount: {
        gte: query.amountFrom ? new Decimal(query.amountFrom) : undefined,
        lte: query.amountTo ? new Decimal(query.amountTo) : undefined,
      },
      createdAt:
        query.createdFrom || query.createdTo
          ? { gte: query.createdFrom ? new Date(query.createdFrom) : undefined, lte: query.createdTo ? new Date(query.createdTo) : undefined }
          : undefined,
      user: query.mobile
        ? { mobile: { contains: query.mobile, mode: 'insensitive' } }
        : undefined,
      OR: query.q ? [{ id: query.q }] : undefined,
    } as const;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.withdrawRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: withdrawalWithUserSelect,
      }),
      this.prisma.withdrawRequest.count({ where }),
    ]);

    return this.paginationService.wrap(
      WithdrawalsMapper.toResponses(items as WithdrawalWithUser[]),
      total,
      page,
      limit,
    );
  }

  async findAdminDetail(id: string): Promise<AdminWithdrawalDetailDto> {
    const withdrawal = await this.prisma.withdrawRequest.findUnique({ where: { id }, select: adminWithdrawalSelect });
    if (!withdrawal) {
      throw new NotFoundException('Withdraw not found');
    }

    const [attachments, outbox] = await this.prisma.$transaction([
      this.prisma.attachment.findMany({
        where: adminWithdrawalAttachmentWhere(id),
        orderBy: { createdAt: 'asc' },
        include: { file: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, label: true, createdAt: true } } },
      }),
      this.prisma.tahesabOutbox.findFirst({
        where: { correlationId: id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return AdminWithdrawalsMapper.toDetail(
      withdrawal,
      attachments.map((att) => ({
        id: att.id,
        fileId: att.fileId,
        purpose: att.purpose ?? null,
        createdAt: att.createdAt,
        file: att.file,
      })),
      outbox ?? undefined,
    );
  }

  async approve(id: string, dto: DecisionDto, adminId: string) {
    const updatedWithdrawal = await runInTx(this.prisma, async (tx) => {
      const [withdraw] = await tx.$queryRaw<WithdrawRequest[]>`
        SELECT * FROM "WithdrawRequest" WHERE id = ${id} FOR UPDATE
      `;

      if (!withdraw) throw new NotFoundException('Withdraw not found');
      if (withdraw.accountTxId) {
        return tx.withdrawRequest.findUnique({ where: { id }, select: withdrawalWithUserSelect });
      }

      const statusAllowsRecovery =
        withdraw.status === WithdrawStatus.PENDING ||
        (withdraw.status === WithdrawStatus.APPROVED && withdraw.accountTxId === null);
      if (!statusAllowsRecovery) {
        throw new BadRequestException('Withdrawal already processed');
      }

      const account = await this.accountsService.getOrCreateAccount(
        withdraw.userId,
        IRR_INSTRUMENT_CODE,
        tx,
      );

      const consumedReservation = await this.accountsService.consumeFunds({
        userId: withdraw.userId,
        instrumentCode: IRR_INSTRUMENT_CODE,
        refType: TxRefType.WITHDRAW,
        refId: withdraw.id,
        tx,
      });

      const total = new Decimal(withdraw.amount);
      const usable = this.accountsService.getUsableCapacity(consumedReservation?.account ?? account);
      if (usable.lt(total)) {
        throw new InsufficientCreditException('Insufficient IRR balance for withdrawal');
      }

      const txResult = await this.accountsService.applyTransaction(
        tx,
        consumedReservation?.account ?? account,
        total.negated(),
        AccountTxType.WITHDRAW,
        TxRefType.WITHDRAW,
        withdraw.id,
        adminId,
      );

      await this.limitsService.consume({ refType: TxRefType.WITHDRAW, refId: withdraw.id }, tx);

      this.logger.log(`Withdrawal ${id} approved by ${adminId}`);

      const processedAt = withdraw.processedAt ? new Date(withdraw.processedAt) : new Date();

      return tx.withdrawRequest.update({
        where: { id },
        data: {
          status: WithdrawStatus.APPROVED,
          processedAt,
          processedById: withdraw.processedById ?? adminId,
          note: dto.note ?? withdraw.note,
          accountTxId: txResult.txRecord.id,
        },
        select: withdrawalWithUserSelect,
      });
    }, { logger: this.logger });

    await this.enqueueTahesabCashOutForWithdrawal(updatedWithdrawal);

    return WithdrawalsMapper.toResponse(updatedWithdrawal as WithdrawalWithUser);
  }

  async reject(id: string, dto: DecisionDto, adminId: string) {
    const updated = await runInTx(this.prisma, async (tx) => {
      const [withdraw] = await tx.$queryRaw<WithdrawRequest[]>`
        SELECT * FROM "WithdrawRequest" WHERE id = ${id} FOR UPDATE
      `;
      if (!withdraw) throw new NotFoundException('Withdraw not found');

      if (withdraw.status === WithdrawStatus.REJECTED) {
        return tx.withdrawRequest.findUnique({ where: { id }, select: withdrawalWithUserSelect });
      }

      if (withdraw.accountTxId || withdraw.status !== WithdrawStatus.PENDING) {
        throw new BadRequestException('Withdrawal already processed');
      }

      await this.limitsService.release({ refType: TxRefType.WITHDRAW, refId: withdraw.id }, tx);
      await this.accountsService.releaseFunds({
        userId: withdraw.userId,
        instrumentCode: IRR_INSTRUMENT_CODE,
        refType: TxRefType.WITHDRAW,
        refId: withdraw.id,
        tx,
      });

      this.logger.log(`Withdrawal ${id} rejected by ${adminId}`);

      return tx.withdrawRequest.update({
        where: { id },
        data: {
          status: WithdrawStatus.REJECTED,
          processedAt: new Date(),
          processedById: adminId,
          note: dto.note,
        },
        select: withdrawalWithUserSelect,
      });
    }, { logger: this.logger });

    return WithdrawalsMapper.toResponse(updated as WithdrawalWithUser);
  }

  private async enqueueTahesabCashOutForWithdrawal(
    withdrawal: Pick<
      WithdrawRequest,
      'status' | 'iban' | 'cardNumber' | 'bankName' | 'amount' | 'processedAt' | 'updatedAt' | 'createdAt' | 'id'
    > & {
      user?: { tahesabCustomerCode?: string | null } | null;
    },
  ): Promise<void> {
    if (!withdrawal || withdrawal.status !== WithdrawStatus.APPROVED) return;
    if (!this.tahesabIntegration.isEnabled()) return;

    const moshtariCode = this.tahesabIntegration.getCustomerCode(withdrawal.user ?? null);
    if (!moshtariCode) return;

    const isBankWithdrawal = Boolean(
      (withdrawal.iban ?? '').length ||
        (withdrawal.cardNumber ?? '').length ||
        (withdrawal.bankName ?? '').length,
    );
    const accountCode = isBankWithdrawal
      ? this.tahesabIntegration.getDefaultBankAccountCode() ??
        this.tahesabIntegration.getDefaultCashAccountCode()
      : this.tahesabIntegration.getDefaultCashAccountCode();
    if (!accountCode) return;

    const { shamsiYear, shamsiMonth, shamsiDay } = this.tahesabIntegration.formatDateParts(
      withdrawal.processedAt ?? withdrawal.updatedAt ?? withdrawal.createdAt,
    );

    const dto: SimpleVoucherDto = {
      sabteKolOrMovaghat: SabteKolOrMovaghat.Kol,
      moshtariCode,
      factorNumber: withdrawal.id,
      shamsiYear,
      shamsiMonth,
      shamsiDay,
      mablagh: Number(withdrawal.amount),
      sharh: `${this.tahesabIntegration.getDescriptionPrefix()} Withdrawal ${withdrawal.id}`,
      factorCode: accountCode,
    };

    const action = isBankWithdrawal ? 'DoNewSanadVKHBank' : 'DoNewSanadVKHVaghNaghd';

    await this.tahesabOutbox.enqueueOnce(action, dto, {
      correlationId: withdrawal.id,
    });
  }

  async cancelWithdrawal(withdrawalId: string, reason?: string) {
    const updated = await runInTx(this.prisma, async (tx) => {
      const [withdrawal] = await tx.$queryRaw<WithdrawRequest[]>`
        SELECT * FROM "WithdrawRequest" WHERE id = ${withdrawalId} FOR UPDATE
      `;
      if (!withdrawal) throw new NotFoundException('Withdraw not found');

      if (withdrawal.status === WithdrawStatus.CANCELLED || withdrawal.status === WithdrawStatus.REVERSED) {
        return tx.withdrawRequest.findUnique({ where: { id: withdrawal.id }, select: withdrawalWithUserSelect });
      }

      if (withdrawal.accountTxId || withdrawal.status === WithdrawStatus.APPROVED) {
        throw new BadRequestException('Withdrawal already processed');
      }

      if (withdrawal.status !== WithdrawStatus.PENDING && withdrawal.status !== WithdrawStatus.REJECTED) {
        return tx.withdrawRequest.findUnique({ where: { id: withdrawal.id }, select: withdrawalWithUserSelect });
      }

      await this.limitsService.release({ refType: TxRefType.WITHDRAW, refId: withdrawal.id }, tx);
      await this.accountsService.releaseFunds({
        userId: withdrawal.userId,
        instrumentCode: IRR_INSTRUMENT_CODE,
        refType: TxRefType.WITHDRAW,
        refId: withdrawal.id,
        tx,
      });

      this.logger.log(`Withdrawal ${withdrawalId} cancelled`);

      return tx.withdrawRequest.update({
        where: { id: withdrawal.id },
        data: { status: WithdrawStatus.CANCELLED, note: reason ?? withdrawal.note },
        select: withdrawalWithUserSelect,
      });
    }, { logger: this.logger });

    await this.enqueueTahesabDeletionForWithdrawal(updated.id);
    return WithdrawalsMapper.toResponse(updated as WithdrawalWithUser);
  }

  private async enqueueTahesabDeletionForWithdrawal(withdrawalId: string): Promise<void> {
    const existing = await this.prisma.tahesabOutbox.findFirst({
      where: {
        correlationId: withdrawalId,
        method: { in: ['DoNewSanadVKHVaghNaghd', 'DoNewSanadVKHBank'] },
        status: 'SUCCESS',
        tahesabFactorCode: { not: null },
      },
    });

    if (!existing?.tahesabFactorCode) {
      this.logger.debug(
        `No Tahesab factor code stored for withdrawal ${withdrawalId}; skipping deletion enqueue.`,
      );
      return;
    }

    await this.tahesabOutbox.enqueueOnce(
      'DoDeleteSanad',
      { factorCode: existing.tahesabFactorCode },
      { correlationId: `withdraw:cancel:${withdrawalId}` },
    );
  }
}
