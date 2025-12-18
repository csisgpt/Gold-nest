import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountTxType, AttachmentEntityType, TxRefType, WithdrawRequest, WithdrawStatus } from '@prisma/client';
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

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly filesService: FilesService,
    private readonly tahesabOutbox: TahesabOutboxService,
    private readonly tahesabIntegration: TahesabIntegrationConfigService,
  ) {}

  async createForUser(userId: string, dto: CreateWithdrawalDto) {
    // Check usable capacity before creating request to give fast feedback
    const amountDecimal = new Decimal(dto.amount);
    const account = await this.accountsService.getOrCreateAccount(
      userId,
      IRR_INSTRUMENT_CODE,
    );
    const balance = new Decimal(account.balance);
    const minBalance = new Decimal(account.minBalance);
    const usable = balance.minus(minBalance);
    if (usable.lt(amountDecimal)) {
      throw new BadRequestException('Insufficient capacity for withdrawal');
    }

    return runInTx(this.prisma, async (tx) => {
      const withdraw = await tx.withdrawRequest.create({
        data: {
          userId,
          amount: amountDecimal,
          bankName: dto.bankName,
          iban: dto.iban,
          cardNumber: dto.cardNumber,
          note: dto.note,
        },
      });

      await this.filesService.createAttachments(
        dto.fileIds,
        AttachmentEntityType.WITHDRAW,
        withdraw.id,
        tx,
      );

      return withdraw;
    }, { logger: this.logger });
  }

  findMy(userId: string) {
    return this.prisma.withdrawRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByStatus(status?: WithdrawStatus) {
    return this.prisma.withdrawRequest.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(id: string, dto: DecisionDto, adminId: string) {
    const updatedWithdrawal = await runInTx(this.prisma, async (tx) => {
      const [withdraw] = await tx.$queryRaw<WithdrawRequest[]>`
        SELECT * FROM "WithdrawRequest" WHERE id = ${id} FOR UPDATE
      `;

      if (!withdraw) throw new NotFoundException('Withdraw not found');
      if (withdraw.accountTxId) {
        return tx.withdrawRequest.findUnique({ where: { id }, include: { user: true } });
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

      const total = new Decimal(withdraw.amount);
      const usable = new Decimal(account.balance).minus(account.minBalance);
      if (usable.lt(total)) {
        throw new InsufficientCreditException('Insufficient IRR balance for withdrawal');
      }

      await this.accountsService.lockAccounts(tx, [account.id]);

      const txResult = await this.accountsService.applyTransaction(
        tx,
        account,
        total.negated(),
        AccountTxType.WITHDRAW,
        TxRefType.WITHDRAW,
        withdraw.id,
        adminId,
      );

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
        include: { user: true },
      });
    }, { logger: this.logger });

    await this.enqueueTahesabCashOutForWithdrawal(updatedWithdrawal);

    return updatedWithdrawal;
  }

  async reject(id: string, dto: DecisionDto, adminId: string) {
    return runInTx(this.prisma, async (tx) => {
      const withdraw = await tx.withdrawRequest.findUnique({ where: { id } });
      if (!withdraw) throw new NotFoundException('Withdraw not found');
      if (withdraw.status !== WithdrawStatus.PENDING) {
        throw new BadRequestException('Withdrawal already processed');
      }

      const { count } = await tx.withdrawRequest.updateMany({
        where: { id, status: WithdrawStatus.PENDING },
        data: {
          status: WithdrawStatus.REJECTED,
          processedAt: new Date(),
          processedById: adminId,
          note: dto.note,
        },
      });

      if (count === 0) {
        throw new BadRequestException('Withdrawal already processed');
      }

      this.logger.log(`Withdrawal ${id} rejected by ${adminId}`);

      return tx.withdrawRequest.findUnique({ where: { id } });
    }, { logger: this.logger });
  }

  private async enqueueTahesabCashOutForWithdrawal(
    withdrawal: Awaited<ReturnType<typeof this.prisma.withdrawRequest.findUnique>> & {
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
      const withdrawal = await tx.withdrawRequest.findUnique({ where: { id: withdrawalId }, include: { user: true } });
      if (!withdrawal) throw new NotFoundException('Withdraw not found');

      if (withdrawal.status === WithdrawStatus.CANCELLED || withdrawal.status === WithdrawStatus.REVERSED) {
        return withdrawal;
      }

      if (withdrawal.status === WithdrawStatus.PENDING || withdrawal.status === WithdrawStatus.REJECTED) {
        return tx.withdrawRequest.update({
          where: { id: withdrawal.id },
          data: { status: WithdrawStatus.CANCELLED, note: reason ?? withdrawal.note },
          include: { user: true },
        });
      }

      if (withdrawal.status === WithdrawStatus.APPROVED) {
        const accountTx = withdrawal.accountTxId
          ? await tx.accountTx.findUnique({ where: { id: withdrawal.accountTxId }, include: { account: true } })
          : null;

        if (accountTx?.account) {
          await this.accountsService.lockAccounts(tx, [accountTx.account.id]);
          await this.accountsService.applyTransaction(
            tx,
            accountTx.account,
            new Decimal(withdrawal.amount),
            AccountTxType.ADJUSTMENT,
            TxRefType.WITHDRAW,
            withdrawal.id,
            undefined,
          );
        }

        return tx.withdrawRequest.update({
          where: { id: withdrawal.id },
          data: { status: WithdrawStatus.REVERSED, note: reason ?? withdrawal.note },
          include: { user: true },
        });
      }

      return withdrawal;
    }, { logger: this.logger });

    await this.enqueueTahesabDeletionForWithdrawal(updated.id);
    return updated;
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
