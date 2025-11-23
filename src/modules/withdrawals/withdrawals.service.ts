import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountTxType, AttachmentEntityType, TxRefType, WithdrawStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { FilesService } from '../files/files.service';
import { IRR_INSTRUMENT_CODE } from '../accounts/constants';
import { DecisionDto } from '../deposits/dto/decision.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

@Injectable()
export class WithdrawalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly filesService: FilesService,
  ) {}

  async create(dto: CreateWithdrawalDto) {
    // Check usable capacity before creating request to give fast feedback
    const account = await this.accountsService.getOrCreateAccount(
      dto.userId,
      IRR_INSTRUMENT_CODE,
    );
    const balance = new Decimal(account.balance);
    const minBalance = new Decimal(account.minBalance);
    const usable = balance.minus(minBalance);
    if (usable.lt(dto.amount)) {
      throw new BadRequestException('Insufficient capacity for withdrawal');
    }

    return this.prisma.$transaction(async (tx) => {
      const withdraw = await tx.withdrawRequest.create({
        data: {
          userId: dto.userId,
          amount: new Decimal(dto.amount),
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

  async approve(id: string, dto: DecisionDto) {
    return this.prisma.$transaction(async (tx) => {
      const withdraw = await tx.withdrawRequest.findUnique({ where: { id } });
      if (!withdraw) throw new NotFoundException('Withdraw not found');
      if (withdraw.status !== WithdrawStatus.PENDING) {
        throw new BadRequestException('Withdrawal already processed');
      }

      const account = await this.accountsService.getOrCreateAccount(
        withdraw.userId,
        IRR_INSTRUMENT_CODE,
        tx,
      );

      const txResult = await this.accountsService.applyTransaction(
        {
          accountId: account.id,
          delta: new Decimal(withdraw.amount).negated(),
          type: AccountTxType.WITHDRAW,
          refType: TxRefType.WITHDRAW,
          refId: withdraw.id,
          createdById: dto.processedById,
        },
        tx,
      );

      return tx.withdrawRequest.update({
        where: { id },
        data: {
          status: WithdrawStatus.APPROVED,
          processedAt: new Date(),
          processedById: dto.processedById,
          accountTxId: txResult.txRecord.id,
          note: dto.note,
        },
      });
    });
  }

  async reject(id: string, dto: DecisionDto) {
    const withdraw = await this.prisma.withdrawRequest.findUnique({ where: { id } });
    if (!withdraw) throw new NotFoundException('Withdraw not found');
    if (withdraw.status !== WithdrawStatus.PENDING) {
      throw new BadRequestException('Withdrawal already processed');
    }

    return this.prisma.withdrawRequest.update({
      where: { id },
      data: {
        status: WithdrawStatus.REJECTED,
        processedAt: new Date(),
        processedById: dto.processedById,
        note: dto.note,
      },
    });
  }
}
