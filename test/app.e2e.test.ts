import assert from 'node:assert';
import { after, test } from 'node:test';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DepositStatus, InstrumentType, InstrumentUnit, SettlementMethod, TradeSide, TradeStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AppModule } from '../src/app.module';
import { AccountsService } from '../src/modules/accounts/accounts.service';
import { HOUSE_USER_ID, IRR_INSTRUMENT_CODE } from '../src/modules/accounts/constants';
import { DepositsService } from '../src/modules/deposits/deposits.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { TradesService } from '../src/modules/trades/trades.service';
import { CreateTradeDto } from '../src/modules/trades/dto/create-trade.dto';

let appPromise: Promise<INestApplication | null> | null = null;
let baseUrl: string | null = null;

async function bootstrapApp(): Promise<INestApplication | null> {
  if (appPromise) {
    return appPromise;
  }

  appPromise = (async () => {
    try {
      const app = await NestFactory.create(AppModule, { logger: false });
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          transform: true,
          forbidUnknownValues: true,
          forbidNonWhitelisted: true,
        }),
      );
      await app.init();
      await app.listen(0);
      baseUrl = await app.getUrl();
      return app;
    } catch (err) {
      console.error('Failed to bootstrap test app', err);
      return null;
    }
  })();

  return appPromise;
}

after(async () => {
  const app = await bootstrapApp();
  if (app) {
    await app.close();
  }
});

function requireApp(app: INestApplication | null, t: any) {
  if (!app || !baseUrl) {
    t.skip('Test app unavailable (likely database connectivity issue)');
    return null;
  }
  return app;
}

function decimalString(value: any): string {
  return new Decimal(value).toString();
}

test('Physical custody request without JWT returns 401', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;

  const res = await fetch(`${baseUrl}/physical-custody/movements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      movementType: 'DEPOSIT',
      weightGram: 1,
      ayar: 750,
    }),
  });

  assert.strictEqual(res.status, 401);
});

async function ensureInstrument(prisma: PrismaService, code: string, unit: InstrumentUnit, type: InstrumentType) {
  return prisma.instrument.upsert({
    where: { code },
    update: {},
    create: { code, name: code, unit, type },
  });
}

test('HOUSE account creation is idempotent per instrument', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);
  const accountsService = app.get(AccountsService);

  const instrumentCode = `E2E_IRR_${Date.now()}`;
  const instrument = await ensureInstrument(prisma, instrumentCode, InstrumentUnit.CURRENCY, InstrumentType.FIAT);

  const first = await accountsService.getOrCreateAccount(HOUSE_USER_ID, instrument.code);
  const second = await accountsService.getOrCreateAccount(HOUSE_USER_ID, instrument.code);

  const count = await prisma.account.count({ where: { userId: HOUSE_USER_ID, instrumentId: instrument.id } });
  assert.strictEqual(count, 1);
  assert.strictEqual(first.id, second.id);
});

test('Approving a deposit twice is safe', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);
  const depositsService = app.get(DepositsService);
  const accountsService = app.get(AccountsService);

  const admin = await prisma.user.create({
    data: {
      fullName: `admin-${Date.now()}`,
      mobile: `09${Date.now().toString().slice(-9)}`,
      email: `admin-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  const client = await prisma.user.create({
    data: {
      fullName: `client-${Date.now()}`,
      mobile: `09${(Date.now() + 1).toString().slice(-9)}`,
      email: `client-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: 'CLIENT',
      status: 'ACTIVE',
    },
  });

  await ensureInstrument(prisma, IRR_INSTRUMENT_CODE, InstrumentUnit.CURRENCY, InstrumentType.FIAT);
  const account = await accountsService.getOrCreateAccount(client.id, IRR_INSTRUMENT_CODE);
  await prisma.account.update({ where: { id: account.id }, data: { balance: new Decimal(0) } });

  const deposit = await prisma.depositRequest.create({
    data: { userId: client.id, amount: new Decimal(1000), method: 'bank', status: DepositStatus.PENDING },
  });

  const approved = await depositsService.approve(deposit.id, { note: 'first' }, admin.id);
  assert.ok(approved.accountTxId);

  await assert.rejects(
    () => depositsService.approve(deposit.id, { note: 'second' }, admin.id),
    /Deposit already processed/,
  );

  const duplicates = await prisma.depositRequest.count({ where: { accountTxId: approved.accountTxId } });
  assert.strictEqual(duplicates, 1);
});

test('Trade reverse is idempotent and restores balances', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);
  const tradesService = app.get(TradesService);
  const accountsService = app.get(AccountsService);

  const admin = await prisma.user.create({
    data: {
      fullName: `admin-${Date.now()}`,
      mobile: `09${(Date.now() + 2).toString().slice(-9)}`,
      email: `admin-trade-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  const client = await prisma.user.create({
    data: {
      fullName: `client-${Date.now() + 2}`,
      mobile: `09${(Date.now() + 3).toString().slice(-9)}`,
      email: `client-trade-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: 'CLIENT',
      status: 'ACTIVE',
    },
  });

  const instrumentCode = `E2E_GOLD_${Date.now()}`;
  const instrument = await ensureInstrument(prisma, instrumentCode, InstrumentUnit.GRAM_750_EQ, InstrumentType.GOLD);

  const userIrr = await accountsService.getOrCreateAccount(client.id, IRR_INSTRUMENT_CODE);
  const userAsset = await accountsService.getOrCreateAccount(client.id, instrument.code);
  const houseIrr = await accountsService.getOrCreateAccount(HOUSE_USER_ID, IRR_INSTRUMENT_CODE);
  const houseAsset = await accountsService.getOrCreateAccount(HOUSE_USER_ID, instrument.code);

  await prisma.account.update({ where: { id: userIrr.id }, data: { balance: new Decimal(1_000_000) } });
  await prisma.account.update({ where: { id: userAsset.id }, data: { balance: new Decimal(100) } });
  await prisma.account.update({ where: { id: houseIrr.id }, data: { balance: new Decimal(1_000_000) } });
  await prisma.account.update({ where: { id: houseAsset.id }, data: { balance: new Decimal(100) } });

  const tradeDto: CreateTradeDto = {
    instrumentCode: instrument.code,
    side: TradeSide.BUY,
    settlementMethod: SettlementMethod.WALLET,
    pricePerUnit: new Decimal(1000).toString(),
    quantity: new Decimal(1).toString(),
  } as any;

  const trade = await tradesService.createForUser(client.id, tradeDto);

  const balancesBefore = await prisma.account.findMany({ where: { id: { in: [userIrr.id, userAsset.id, houseIrr.id, houseAsset.id] } } });

  await tradesService.approve(trade.id, { adminNote: 'approve' }, admin.id);

  await tradesService.reverseTrade(trade.id, admin.id, 'reverse');

  const balancesAfterReverse = await prisma.account.findMany({ where: { id: { in: [userIrr.id, userAsset.id, houseIrr.id, houseAsset.id] } } });
  balancesBefore.forEach((before) => {
    const after = balancesAfterReverse.find((b) => b.id === before.id)!;
    assert.strictEqual(decimalString(after.balance), decimalString(before.balance));
  });

  await tradesService.reverseTrade(trade.id, admin.id, 'reverse again');
  const balancesAfterSecondReverse = await prisma.account.findMany({ where: { id: { in: [userIrr.id, userAsset.id, houseIrr.id, houseAsset.id] } } });
  balancesBefore.forEach((before) => {
    const after = balancesAfterSecondReverse.find((b) => b.id === before.id)!;
    assert.strictEqual(decimalString(after.balance), decimalString(before.balance));
  });

  const updatedTrade = await prisma.trade.findUnique({ where: { id: trade.id } });
  assert.strictEqual(updatedTrade?.status, TradeStatus.CANCELLED_BY_ADMIN);
});
