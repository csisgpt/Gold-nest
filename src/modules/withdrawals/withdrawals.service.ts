import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountTxType, AttachmentEntityType, TxRefType, WithdrawStatus } from '@prisma/client';
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

    return this.prisma.$transaction(async (tx) => {
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
    });
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
    const updatedWithdrawal = await this.prisma.$transaction(async (tx) => {
      const withdraw = await tx.withdrawRequest.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!withdraw) throw new NotFoundException('Withdraw not found');
      if (withdraw.status !== WithdrawStatus.PENDING) {
        throw new BadRequestException('Withdrawal already processed');
      }

      const { count } = await tx.withdrawRequest.updateMany({
        where: { id, status: WithdrawStatus.PENDING },
        data: {
          status: WithdrawStatus.APPROVED,
          processedAt: new Date(),
          processedById: adminId,
          note: dto.note,
        },
      });

      if (count === 0) {
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

      return tx.withdrawRequest.update({
        where: { id },
        data: {
          accountTxId: txResult.txRecord.id,
        },
        include: { user: true },
      });
    });

    await this.enqueueTahesabCashOutForWithdrawal(updatedWithdrawal);

    return updatedWithdrawal;
  }

  async reject(id: string, dto: DecisionDto, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
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
    });
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

    const cashAccountCode = this.tahesabIntegration.getDefaultCashAccountCode();
    if (!cashAccountCode) return;

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
      factorCode: cashAccountCode,
    };

    await this.tahesabOutbox.enqueueOnce('DoNewSanadVKHVaghNaghd', dto, {
      correlationId: withdrawal.id,
    });
  }
}
