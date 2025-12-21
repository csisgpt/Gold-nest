import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountsService } from '../src/modules/accounts/accounts.service';

enum AccountReservationStatus {
  RESERVED = 'RESERVED',
  CONSUMED = 'CONSUMED',
  RELEASED = 'RELEASED',
}

enum AccountTxType {
  ADJUSTMENT = 'ADJUSTMENT',
}

enum InstrumentType {
  FIAT = 'FIAT',
}

enum TxRefType {
  DEPOSIT = 'DEPOSIT',
  ADJUSTMENT = 'ADJUSTMENT',
}

class AccountsTxMock {
  instruments = [{ id: 'inst1', code: 'IRR', type: InstrumentType.FIAT }];
  accounts: any[] = [];
  reservations: any[] = [];
  accountTxs: any[] = [];

  instrument = {
    findUnique: async ({ where: { code } }: any) => this.instruments.find((i) => i.code === code) || null,
  };

  account = {
    findUnique: async ({ where }: any) => {
      if (where.userId_instrumentId) {
        return this.accounts.find(
          (a) => a.userId === where.userId_instrumentId.userId && a.instrumentId === where.userId_instrumentId.instrumentId,
        ) || null;
      }
      if (where.id) {
        return this.accounts.find((a) => a.id === where.id) || null;
      }
      return null;
    },
    create: async ({ data }: any) => {
      const balance = data.balance instanceof Decimal ? data.balance : new Decimal(data.balance ?? 0);
      const created = {
        id: `acc-${this.accounts.length + 1}`,
        balance: balance.gt(0) ? balance : new Decimal(100),
        blockedBalance:
          data.blockedBalance instanceof Decimal ? data.blockedBalance : new Decimal(data.blockedBalance ?? 0),
        minBalance:
          data.minBalance instanceof Decimal ? data.minBalance : new Decimal(data.minBalance ?? 0),
        ...data,
      };
      this.accounts.push(created);
      return created;
    },
    update: async ({ where: { id }, data }: any) => {
      const account = this.accounts.find((a) => a.id === id);
      if (!account) throw new Error('not found');
      Object.assign(account, data);
      return account;
    },
  };

  accountReservation = {
    findUnique: async ({ where }: any) => {
      return (
        this.reservations.find(
          (r) =>
            r.accountId === where.refType_refId_accountId.accountId &&
            r.refId === where.refType_refId_accountId.refId &&
            r.refType === where.refType_refId_accountId.refType,
        ) || null
      );
    },
    create: async ({ data }: any) => {
      const created = { id: `res-${this.reservations.length + 1}`, ...data };
      this.reservations.push(created);
      return created;
    },
    update: async ({ where: { id }, data }: any) => {
      const reservation = this.reservations.find((r) => r.id === id);
      if (!reservation) throw new Error('not found');
      Object.assign(reservation, data);
      return reservation;
    },
  };

  accountTx = {
    create: async ({ data }: any) => {
      const created = { id: `tx-${this.accountTxs.length + 1}`, ...data };
      this.accountTxs.push(created);
      return created;
    },
  };

  user = {
    upsert: async () => null,
  };

  async $executeRawUnsafe() {
    return 1;
  }

  async $transaction(actions: any[]) {
    return Promise.all(actions.map((action) => action));
  }
}

function createService() {
  const tx = new AccountsTxMock() as any;
  const service = new AccountsService(tx as any);
  return { service, tx };
}

test('usable capacity subtracts blocked and min balance', () => {
  const { service } = createService();
  const usable = service.getUsableCapacity({ balance: new Decimal(100), blockedBalance: new Decimal(10), minBalance: 5 });
  assert.strictEqual(usable.toString(), '85');
});

test('reserveFunds is idempotent for same ref', async () => {
  const { service, tx } = createService();
  const seeded = await service.getOrCreateAccount('u1', 'IRR', tx);
  seeded.balance = new Decimal(100);
  tx.accounts[0] = seeded;
  await service.reserveFunds({
    userId: 'u1',
    instrumentCode: 'IRR',
    amount: new Decimal(10),
    refId: 'r1',
    refType: TxRefType.DEPOSIT,
    tx,
  });
  const second = await service.reserveFunds({
    userId: 'u1',
    instrumentCode: 'IRR',
    amount: new Decimal(10),
    refId: 'r1',
    refType: TxRefType.DEPOSIT,
    tx,
  });
  const account = tx.accounts[0];
  assert.strictEqual(account.blockedBalance.toString(), '10');
  assert.strictEqual(second.reservation.status, AccountReservationStatus.RESERVED);
});

test('releaseFunds is idempotent', async () => {
  const { service, tx } = createService();
  const seeded = await service.getOrCreateAccount('u1', 'IRR', tx);
  seeded.balance = new Decimal(100);
  tx.accounts[0] = seeded;
  await service.reserveFunds({
    userId: 'u1',
    instrumentCode: 'IRR',
    amount: new Decimal(10),
    refId: 'r1',
    refType: TxRefType.DEPOSIT,
    tx,
  });

  await service.releaseFunds({ userId: 'u1', instrumentCode: 'IRR', refId: 'r1', refType: TxRefType.DEPOSIT, tx });
  await service.releaseFunds({ userId: 'u1', instrumentCode: 'IRR', refId: 'r1', refType: TxRefType.DEPOSIT, tx });

  const account = tx.accounts[0];
  assert.strictEqual(account.blockedBalance.toString(), '0');
});

test('applyTransaction enforces non-negative usable balance', async () => {
  const { service, tx } = createService();
  const account = await service.getOrCreateAccount('u1', 'IRR', tx);
  account.blockedBalance = new Decimal(50);
  account.minBalance = new Decimal(10);
  tx.accounts[0] = account;

  await assert.rejects(
    () =>
      service.applyTransaction(
        {
          accountId: account.id,
          delta: new Decimal(-70),
          type: AccountTxType.ADJUSTMENT,
          refType: TxRefType.ADJUSTMENT,
        },
        tx,
      ),
  );
});
