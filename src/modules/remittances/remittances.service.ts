import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountTxType, TxRefType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CreateRemittanceDto } from './dto/create-remittance.dto';
import { RemittanceResponseDto } from './dto/remittance-response.dto';
import { InsufficientCreditException } from '../../common/exceptions/insufficient-credit.exception';

@Injectable()
export class RemittancesService {
  private readonly logger = new Logger(RemittancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  async createForUser(fromUserId: string, dto: CreateRemittanceDto): Promise<RemittanceResponseDto> {
    const toUser = await this.prisma.user.findUnique({ where: { mobile: dto.toMobile } });
    if (!toUser) {
      throw new NotFoundException('Destination user not found');
    }

    if (toUser.id === fromUserId) {
      throw new BadRequestException('Cannot transfer to self');
    }

    const instrument = await this.prisma.instrument.findUnique({ where: { code: dto.instrumentCode } });
    if (!instrument) {
      throw new NotFoundException(`Instrument ${dto.instrumentCode} not found`);
    }

    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Amount must be positive');
    }

    const remittance = await this.prisma.$transaction(async (tx) => {
      const fromAccount = await this.accountsService.getOrCreateAccount(
        fromUserId,
        instrument.code,
        tx,
      );
      const toAccount = await this.accountsService.getOrCreateAccount(toUser.id, instrument.code, tx);

      const usable = new Decimal(fromAccount.balance).minus(fromAccount.minBalance);
      if (usable.lt(amount)) {
        throw new InsufficientCreditException('Insufficient balance for remittance');
      }

      const remittanceRecord = await tx.remittance.create({
        data: {
          fromUserId,
          toUserId: toUser.id,
          instrumentId: instrument.id,
          amount,
          note: dto.note,
        },
      });

      const fromTx = await this.accountsService.applyTransaction(
        tx,
        fromAccount,
        amount.negated(),
        AccountTxType.REMITTANCE,
        TxRefType.REMITTANCE,
        remittanceRecord.id,
        fromUserId,
      );

      const toTx = await this.accountsService.applyTransaction(
        tx,
        toAccount,
        amount,
        AccountTxType.REMITTANCE,
        TxRefType.REMITTANCE,
        remittanceRecord.id,
        fromUserId,
      );

      const updated = await tx.remittance.update({
        where: { id: remittanceRecord.id },
        data: {
          fromAccountTxId: fromTx.txRecord.id,
          toAccountTxId: toTx.txRecord.id,
        },
      });

      return updated;
    });

    this.logger.log(`Remittance ${remittance.id} created by ${fromUserId}`);

    return {
      id: remittance.id,
      fromUserId: remittance.fromUserId,
      toUserId: remittance.toUserId,
      toMobile: toUser.mobile,
      instrumentCode: instrument.code,
      amount: remittance.amount.toString(),
      note: remittance.note ?? undefined,
      createdAt: remittance.createdAt,
    };
  }

  async findByUser(userId: string): Promise<RemittanceResponseDto[]> {
    const remittances = await this.prisma.remittance.findMany({
      where: {
        OR: [
          { fromUserId: userId },
          { toUserId: userId },
        ],
      },
      include: {
        instrument: true,
        toUser: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return remittances.map((remittance) => ({
      id: remittance.id,
      fromUserId: remittance.fromUserId,
      toUserId: remittance.toUserId,
      toMobile: remittance.toUser.mobile,
      instrumentCode: remittance.instrument.code,
      amount: remittance.amount.toString(),
      note: remittance.note ?? undefined,
      createdAt: remittance.createdAt,
    }));
  }
}
