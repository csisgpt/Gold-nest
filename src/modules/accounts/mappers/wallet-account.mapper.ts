import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { WalletAccountDto } from '../dto/wallet-account.dto';

export type AccountWithInstrument = Prisma.AccountGetPayload<{ include: { instrument: true } }>;

export function mapWalletAccountDto(account: AccountWithInstrument, hideBalances: boolean): WalletAccountDto {
  const available = new Decimal(account.balance)
    .minus(new Decimal(account.blockedBalance ?? 0))
    .minus(new Decimal(account.minBalance ?? 0));

  return {
    instrument: {
      id: account.instrument.id,
      code: account.instrument.code,
      name: account.instrument.name,
      type: account.instrument.type,
      unit: account.instrument.unit,
    },
    balance: hideBalances ? null : account.balance.toString(),
    blockedBalance: hideBalances ? null : account.blockedBalance.toString(),
    minBalance: hideBalances ? null : account.minBalance.toString(),
    available: hideBalances ? null : available.toString(),
    balancesHidden: hideBalances,
    updatedAt: account.updatedAt,
  };
}
