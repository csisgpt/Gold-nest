import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaClient, AccountTxType, TxRefType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InsufficientCreditException } from '../../common/exceptions/insufficient-credit.exception';

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
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateAccount(
    userId: string | null,
    instrumentCode: string,
    tx?: PrismaClient,
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

  async applyTransaction(input: ApplyTransactionInput, tx?: PrismaClient) {
    const client = tx ?? this.prisma;
    const deltaDecimal = new Decimal(input.delta);

    const executor = async (trx: PrismaClient) => {
      // Lock account row for update using a raw query. Prisma lacks direct FOR UPDATE,
      // but this raw select inside the transaction forces the row to be locked.
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
        // Prevent breaching agreed credit lines (minBalance is usually negative)
        throw new InsufficientCreditException();
      }

      const [txRecord, updated] = await trx.$transaction([
        trx.accountTx.create({
          data: {
            accountId: account.id,
            delta: deltaDecimal,
            type: input.type,
            refType: input.refType,
            refId: input.refId,
            createdById: input.createdById,
          },
        }),
        trx.account.update({
          where: { id: account.id },
          data: { balance: newBalance },
        }),
      ]);

      return { txRecord, account: updated };
    };

    if (tx) {
      return executor(tx);
    }

    return client.$transaction((trx) => executor(trx));
  }
}
