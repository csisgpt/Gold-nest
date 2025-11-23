import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AccountTxType, AttachmentEntityType, DepositStatus, TxRefType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { FilesService } from '../files/files.service';
import { IRR_INSTRUMENT_CODE } from '../accounts/constants';
import { DecisionDto } from './dto/decision.dto';
import { CreateDepositDto } from './dto/create-deposit.dto';

@Injectable()
export class DepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly filesService: FilesService,
  ) {}

  async create(dto: CreateDepositDto) {
    return this.prisma.$transaction(async (tx) => {
      const deposit = await tx.depositRequest.create({
        data: {
          userId: dto.userId,
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

  async approve(id: string, dto: DecisionDto) {
    return this.prisma.$transaction(async (tx) => {
      const deposit = await tx.depositRequest.findUnique({ where: { id } });
      if (!deposit) throw new NotFoundException('Deposit not found');
      if (deposit.status !== DepositStatus.PENDING) {
        throw new BadRequestException('Deposit already processed');
      }

      const account = await this.accountsService.getOrCreateAccount(
        deposit.userId,
        IRR_INSTRUMENT_CODE,
        tx,
      );

      const txResult = await this.accountsService.applyTransaction(
        {
          accountId: account.id,
          delta: deposit.amount,
          type: AccountTxType.DEPOSIT,
          refType: TxRefType.DEPOSIT,
          refId: deposit.id,
          createdById: dto.processedById,
        },
        tx,
      );

      return tx.depositRequest.update({
        where: { id },
        data: {
          status: DepositStatus.APPROVED,
          processedAt: new Date(),
          processedById: dto.processedById,
          accountTxId: txResult.txRecord.id,
          note: dto.note,
        },
      });
    });
  }

  async reject(id: string, dto: DecisionDto) {
    const deposit = await this.prisma.depositRequest.findUnique({ where: { id } });
    if (!deposit) throw new NotFoundException('Deposit not found');
    if (deposit.status !== DepositStatus.PENDING) {
      throw new BadRequestException('Deposit already processed');
    }

    return this.prisma.depositRequest.update({
      where: { id },
      data: {
        status: DepositStatus.REJECTED,
        processedAt: new Date(),
        processedById: dto.processedById,
        note: dto.note,
      },
    });
  }
}
