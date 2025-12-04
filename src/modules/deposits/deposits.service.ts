import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { AccountTxType, AttachmentEntityType, DepositStatus, TxRefType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { FilesService } from '../files/files.service';
import { IRR_INSTRUMENT_CODE } from '../accounts/constants';
import { DecisionDto } from './dto/decision.dto';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { TahesabOutboxService } from '../tahesab/tahesab-outbox.service';
import { TahesabIntegrationConfigService } from '../tahesab/tahesab-integration.config';
import { SabteKolOrMovaghat } from '../tahesab/tahesab.methods';
import { SimpleVoucherDto } from '../tahesab/tahesab-documents.service';

@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly filesService: FilesService,
    private readonly tahesabOutbox: TahesabOutboxService,
    private readonly tahesabIntegration: TahesabIntegrationConfigService,
  ) {}

  async createForUser(userId: string, dto: CreateDepositDto) {
    return this.prisma.$transaction(async (tx) => {
      const deposit = await tx.depositRequest.create({
        data: {
          userId,
          amount: new Decimal(dto.amount),
          method: dto.method,
          refNo: dto.refNo,
          note: dto.note,
        },
      });

      await this.filesService.createAttachments(
        dto.fileIds,
        AttachmentEntityType.DEPOSIT,
        deposit.id,
        tx,
      );

      return deposit;
    });
  }

  findMy(userId: string) {
    return this.prisma.depositRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByStatus(status?: DepositStatus) {
    return this.prisma.depositRequest.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(id: string, dto: DecisionDto, adminId: string) {
    const updatedDeposit = await this.prisma.$transaction(async (tx) => {
      const deposit = await tx.depositRequest.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!deposit) throw new NotFoundException('Deposit not found');
      if (deposit.status !== DepositStatus.PENDING) {
        throw new BadRequestException('Deposit already processed');
      }

      const { count } = await tx.depositRequest.updateMany({
        where: { id, status: DepositStatus.PENDING },
        data: {
          status: DepositStatus.APPROVED,
          processedAt: new Date(),
          processedById: adminId,
          note: dto.note,
        },
      });

      if (count === 0) {
        throw new BadRequestException('Deposit already processed');
      }

      const account = await this.accountsService.getOrCreateAccount(
        deposit.userId,
        IRR_INSTRUMENT_CODE,
        tx,
      );

      const txResult = await this.accountsService.applyTransaction(
        tx,
        account,
        deposit.amount,
        AccountTxType.DEPOSIT,
        TxRefType.DEPOSIT,
        deposit.id,
        adminId,
      );

      this.logger.log(`Deposit ${id} approved by ${adminId}`);

      return tx.depositRequest.update({
        where: { id },
        data: {
          accountTxId: txResult.txRecord.id,
        },
        include: { user: true },
      });
    });

    await this.enqueueTahesabCashInForDeposit(updatedDeposit);

    return updatedDeposit;
  }

  async reject(id: string, dto: DecisionDto, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const deposit = await tx.depositRequest.findUnique({ where: { id } });
      if (!deposit) throw new NotFoundException('Deposit not found');
      if (deposit.status !== DepositStatus.PENDING) {
        throw new BadRequestException('Deposit already processed');
      }

      const { count } = await tx.depositRequest.updateMany({
        where: { id, status: DepositStatus.PENDING },
        data: {
          status: DepositStatus.REJECTED,
          processedAt: new Date(),
          processedById: adminId,
          note: dto.note,
        },
      });

      if (count === 0) {
        throw new BadRequestException('Deposit already processed');
      }

      this.logger.log(`Deposit ${id} rejected by ${adminId}`);

      return tx.depositRequest.findUnique({ where: { id } });
    });
  }

  private async enqueueTahesabCashInForDeposit(
    deposit: Awaited<ReturnType<typeof this.prisma.depositRequest.findUnique>> & {
      user?: { tahesabCustomerCode?: string | null } | null;
    },
  ): Promise<void> {
    if (!deposit || deposit.status !== DepositStatus.APPROVED) return;
    if (!this.tahesabIntegration.isEnabled()) return;

    const moshtariCode = this.tahesabIntegration.getCustomerCode(deposit.user ?? null);
    if (!moshtariCode) return;

    const cashAccountCode = this.tahesabIntegration.getDefaultCashAccountCode();
    if (!cashAccountCode) return;

    const { shamsiYear, shamsiMonth, shamsiDay } = this.tahesabIntegration.formatDateParts(
      deposit.processedAt ?? deposit.updatedAt ?? deposit.createdAt,
    );

    const dto: SimpleVoucherDto = {
      sabteKolOrMovaghat: SabteKolOrMovaghat.Kol,
      moshtariCode,
      factorNumber: deposit.id,
      shamsiYear,
      shamsiMonth,
      shamsiDay,
      mablagh: Number(deposit.amount),
      sharh: `${this.tahesabIntegration.getDescriptionPrefix()} Deposit ${deposit.id}`,
      factorCode: cashAccountCode,
    };

    await this.tahesabOutbox.enqueueOnce('DoNewSanadVKHVaghNaghd', dto, {
      correlationId: deposit.id,
    });
  }
}
