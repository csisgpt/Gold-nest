import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import {
  PrismaClient,
  Prisma,
  AccountTxType,
  TxRefType,
  InstrumentType,
  TradeSide,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InsufficientCreditException } from '../../common/exceptions/insufficient-credit.exception';
import { AccountStatementEntryDto } from './dto/account-statement-entry.dto';
import { AccountStatementFiltersDto } from './dto/account-statement-filters.dto';
import { IRR_INSTRUMENT_CODE } from './constants';

type DepositRequestType = Prisma.DepositRequestGetPayload<{}>;
// تایپ داده‌های Withdraw
type WithdrawRequestType = Prisma.WithdrawRequestGetPayload<{}>;
// تایپ داده‌های Trade، شامل اینکلود Instrument
type TradeType = Prisma.TradeGetPayload<{ include: { instrument: true } }>;
// تایپ داده‌های Remittance
type RemittanceType = Prisma.RemittanceGetPayload<{}>;


// 👇 این type alias رو اضافه کن
type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

// TODO: Introduce a Remittance entity/service that leverages TxRefType.REMITTANCE for internal transfers.

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

  async applyTransaction(
    inputOrTx: ApplyTransactionInput | PrismaClientOrTx,
    accountOrInput?: any,
    delta?: Decimal | string | number,
    type?: AccountTxType,
    refType?: TxRefType,
    refId?: string,
    createdById?: string,
  ) {
    const isLegacyInput = (candidate: any): candidate is ApplyTransactionInput =>
      typeof candidate?.accountId === 'string';

    const { input, tx } = isLegacyInput(inputOrTx)
      ? { input: inputOrTx, tx: accountOrInput }
      : {
        input: {
          accountId: accountOrInput?.id,
          delta: delta!,
          type: type!,
          refType: refType!,
          refId,
          createdById,
        } as ApplyTransactionInput,
        tx: inputOrTx,
      };

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

  async getStatementForUser(
    userId: string,
    filters: AccountStatementFiltersDto = {} as AccountStatementFiltersDto,
  ): Promise<AccountStatementEntryDto[]> {
    const accounts = await this.resolveAccountsForStatement(userId, filters);
    if (accounts.length === 0) {
      return [];
    }

    const where: Prisma.AccountTxWhereInput = {
      accountId: { in: accounts.map((a) => a.id) },
    };

    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }

    const accountTxs = await this.prisma.accountTx.findMany({
      where,
      include: { account: { include: { instrument: true } } },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });

    const depositIds = new Set<string>();
    const withdrawIds = new Set<string>();
    const tradeIds = new Set<string>();
    const remittanceIds = new Set<string>();

    accountTxs.forEach((tx) => {
      if (!tx.refId) return;
      switch (tx.refType) {
        case TxRefType.DEPOSIT:
          depositIds.add(tx.refId);
          break;
        case TxRefType.WITHDRAW:
          withdrawIds.add(tx.refId);
          break;
        case TxRefType.TRADE:
          tradeIds.add(tx.refId);
          break;
        case TxRefType.REMITTANCE:
          remittanceIds.add(tx.refId);
          break;
        default:
          break;
      }
    });

    const [deposits, withdraws, trades, remittances] = await Promise.all([
      depositIds.size
        ? this.prisma.depositRequest.findMany({ where: { id: { in: Array.from(depositIds) } } })
        : [],
      withdrawIds.size
        ? this.prisma.withdrawRequest.findMany({ where: { id: { in: Array.from(withdrawIds) } } })
        : [],
      tradeIds.size
        ? this.prisma.trade.findMany({
          where: { id: { in: Array.from(tradeIds) } },
          include: { instrument: true },
        })
        : [],
      remittanceIds.size
        ? this.prisma.remittance.findMany({ where: { id: { in: Array.from(remittanceIds) } } })
        : [],
    ]);

    const depositMap = new Map<string, DepositRequestType>(
      deposits.map((d) => [d.id, d] as const)
    );
    const withdrawMap = new Map<string, WithdrawRequestType>(
      withdraws.map((w) => [w.id, w] as const)
    );
    const tradeMap = new Map<string, TradeType>(
      trades.map((t) => [t.id, t] as const)
    );
    const remittanceMap = new Map<string, RemittanceType>(
      remittances.map((r) => [r.id, r] as const)
    );

    const entries: AccountStatementEntryDto[] = accountTxs.map((tx) => {
      const delta = new Decimal(tx.delta);
      const instrument = tx.account.instrument;
      let docType: string = tx.refType;
      let docNo: string = tx.id;
      let description: string | undefined;

      if (tx.refId) {
        if (tx.refType === TxRefType.DEPOSIT) {
          const deposit = depositMap.get(tx.refId);
          if (deposit) {
            docType = 'DEPOSIT';
            docNo = deposit.refNo ?? deposit.id;
            description = deposit.note ?? undefined;
          }
        } else if (tx.refType === TxRefType.WITHDRAW) {
          const withdraw = withdrawMap.get(tx.refId);
          if (withdraw) {
            docType = 'WITHDRAW';
            docNo = withdraw.id;
            description = withdraw.note ?? undefined;
          }
        } else if (tx.refType === TxRefType.TRADE) {
          const trade = tradeMap.get(tx.refId);
          if (trade) {
            docType = trade.side === TradeSide.BUY ? 'TRADE_BUY' : 'TRADE_SELL';
            docNo = trade.id;
            description = trade.clientNote ?? trade.instrument.name;
          }
        } else if (tx.refType === TxRefType.REMITTANCE) {
          const remittance = remittanceMap.get(tx.refId);
          if (remittance) {
            const isOutgoing = remittance.fromUserId === userId;
            docType = isOutgoing ? 'REMITTANCE_OUT' : 'REMITTANCE_IN';
            docNo = remittance.id;
            description = remittance.note ?? undefined;
          }
        }
      }

      const entry: AccountStatementEntryDto = {
        date: tx.createdAt,
        docNo,
        docType,
        description,
      };

      if (instrument.code === IRR_INSTRUMENT_CODE) {
        if (delta.gt(0)) entry.creditMoney = delta.toString();
        else if (delta.lt(0)) entry.debitMoney = delta.abs().toString();
      } else if (instrument.type === InstrumentType.GOLD) {
        if (delta.gt(0)) entry.creditWeight = delta.toString();
        else if (delta.lt(0)) entry.debitWeight = delta.abs().toString();
      }

      return entry;
    });

    return entries;
  }

  private async resolveAccountsForStatement(
    userId: string,
    filters: AccountStatementFiltersDto = {} as AccountStatementFiltersDto,
  ) {
    if (filters.instrumentCode) {
      const instrument = await this.prisma.instrument.findUnique({
        where: { code: filters.instrumentCode },
      });
      if (!instrument) {
        throw new NotFoundException(`Instrument ${filters.instrumentCode} not found`);
      }

      const account = await this.prisma.account.findUnique({
        where: { userId_instrumentId: { userId, instrumentId: instrument.id } },
        include: { instrument: true },
      });

      return account ? [account] : [];
    }

    return this.prisma.account.findMany({
      where: {
        userId,
        OR: [
          { instrument: { code: IRR_INSTRUMENT_CODE } },
          { instrument: { type: InstrumentType.GOLD } },
        ],
      },
      include: { instrument: true },
    });
  }

}
