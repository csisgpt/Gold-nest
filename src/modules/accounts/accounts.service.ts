import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaClient, Prisma, AccountTxType, TxRefType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InsufficientCreditException } from '../../common/exceptions/insufficient-credit.exception';

// 👇 این type alias رو اضافه کن
type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export interface ApplyTransactionInput {
  accountId: string;
  delta: Decimal | string | number;
  type: AccountTxType;
  refType: TxRefType;
  refId?: string;
  createdById?: string;
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) { }

  async getOrCreateAccount(
    userId: string | null,
    instrumentCode: string,
    tx?: any,                       // 👈 اینجا رو شُل کردیم
  ) {
    const client = tx ?? this.prisma;

    const instrument = await client.instrument.findUnique({
      where: { code: instrumentCode },
    });
    if (!instrument) {
      throw new NotFoundException(`Instrument ${instrumentCode} not found`);
    }

    const existing = await client.account.findUnique({
      where: { userId_instrumentId: { userId, instrumentId: instrument.id } },
    });
    if (existing) return existing;

    return client.account.create({
      data: {
        userId,
        instrumentId: instrument.id,
        balance: new Decimal(0),
        blockedBalance: new Decimal(0),
        minBalance: new Decimal(0),
      },
    });
  }

  async applyTransaction(input: ApplyTransactionInput, tx?: any) {
    const deltaDecimal = new Decimal(input.delta);

    const executor = async (trx: any) => {
      await trx.$executeRawUnsafe(
        `SELECT 1 FROM "Account" WHERE id = $1 FOR UPDATE`,
        input.accountId,
      );

      const account = await trx.account.findUnique({
        where: { id: input.accountId },
      });
      if (!account) {
        throw new NotFoundException('Account not found');
      }

      const newBalance = new Decimal(account.balance).add(deltaDecimal);
      if (newBalance.lt(account.minBalance)) {
        throw new InsufficientCreditException();
      }

      const txRecord = await trx.accountTx.create({
        data: {
          accountId: account.id,
          delta: deltaDecimal,
          type: input.type,
          refType: input.refType,
          refId: input.refId,
          createdById: input.createdById,
        },
      });

      const updated = await trx.account.update({
        where: { id: account.id },
        data: { balance: newBalance },
      });

      return { txRecord, account: updated };
    };

    if (tx) {
      // اگر از بیرون توی یک ترنزکشن صدا زده بشه
      return executor(tx);
    }

    // اگر نه، خودمون یه ترنزکشن می‌سازیم
    return this.prisma.$transaction((trx) => executor(trx));
  }

}
