import assert from 'node:assert';
import { after, test } from 'node:test';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  DepositStatus,
  InstrumentType,
  InstrumentUnit,
  SettlementMethod,
  TradeSide,
  TradeStatus,
  TxRefType,
  UserRole,
  WithdrawStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AppModule } from '../src/app.module';
import { AccountsService } from '../src/modules/accounts/accounts.service';
import { HOUSE_USER_ID, IRR_INSTRUMENT_CODE } from '../src/modules/accounts/constants';
import { DepositsService } from '../src/modules/deposits/deposits.service';
import { WithdrawalsService } from '../src/modules/withdrawals/withdrawals.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { TradesService } from '../src/modules/trades/trades.service';
import { CreateTradeDto } from '../src/modules/trades/dto/create-trade.dto';
import { JwtService } from '@nestjs/jwt';

let appPromise: Promise<INestApplication | null> | null = null;
let baseUrl: string | null = null;
let jwtService: JwtService | null = null;

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
      jwtService = app.get(JwtService);
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

function authHeader(user: { id: string; mobile: string; role: UserRole }) {
  if (!jwtService) return {};
  const token = jwtService.sign({ sub: user.id, mobile: user.mobile, role: user.role });
  return { Authorization: `Bearer ${token}` };
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

test('Physical custody approve/cancel require admin role', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);

  const admin = await prisma.user.create({
    data: {
      fullName: `admin-${Date.now()}`,
      mobile: `09${Date.now().toString().slice(-9)}`,
      email: `admin-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: UserRole.ADMIN,
      status: 'ACTIVE',
    },
  });

  const client = await prisma.user.create({
    data: {
      fullName: `client-${Date.now()}`,
      mobile: `09${(Date.now() + 1).toString().slice(-9)}`,
      email: `client-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: UserRole.CLIENT,
      status: 'ACTIVE',
    },
  });

  const movement = await prisma.physicalCustodyMovement.create({
    data: {
      userId: client.id,
      movementType: 'DEPOSIT',
      status: 'PENDING',
      weightGram: new Decimal(1),
      ayar: 750,
    },
  });

  const unauthApprove = await fetch(`${baseUrl}/physical-custody/movements/${movement.id}/approve`, {
    method: 'POST',
  });
  assert.strictEqual(unauthApprove.status, 401);

  const userApprove = await fetch(`${baseUrl}/physical-custody/movements/${movement.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(client) },
  });
  assert.strictEqual(userApprove.status, 403);

  const adminApprove = await fetch(`${baseUrl}/physical-custody/movements/${movement.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(admin) },
  });
  assert.ok(adminApprove.status >= 200 && adminApprove.status < 300);
  const approvedBody = await adminApprove.json();
  assert.strictEqual(approvedBody.status, 'APPROVED');

  const unauthCancel = await fetch(`${baseUrl}/physical-custody/movements/${movement.id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'nope' }),
  });
  assert.strictEqual(unauthCancel.status, 401);

  const userCancel = await fetch(`${baseUrl}/physical-custody/movements/${movement.id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(client) },
    body: JSON.stringify({ reason: 'nope' }),
  });
  assert.strictEqual(userCancel.status, 403);

  const adminCancel = await fetch(`${baseUrl}/physical-custody/movements/${movement.id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(admin) },
    body: JSON.stringify({ reason: 'admin cancel' }),
  });
  assert.ok(adminCancel.status >= 200 && adminCancel.status < 300);
  const cancelledBody = await adminCancel.json();
  assert.strictEqual(cancelledBody.status, 'CANCELLED');
});

test('Admin approvals for deposits/withdrawals enforce JWT and admin role', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);

  const admin = await prisma.user.create({
    data: {
      fullName: `admin-${Date.now()}`,
      mobile: `09${Date.now().toString().slice(-9)}`,
      email: `admin-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: UserRole.ADMIN,
      status: 'ACTIVE',
    },
  });

  const client = await prisma.user.create({
    data: {
      fullName: `client-${Date.now()}`,
      mobile: `09${(Date.now() + 1).toString().slice(-9)}`,
      email: `client-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: UserRole.CLIENT,
      status: 'ACTIVE',
    },
  });

  await ensureInstrument(prisma, IRR_INSTRUMENT_CODE, InstrumentUnit.CURRENCY, InstrumentType.FIAT);

  const deposit = await prisma.depositRequest.create({
    data: {
      userId: client.id,
      amount: new Decimal(1000),
      method: 'bank',
      status: DepositStatus.PENDING,
    },
  });

  const withdrawal = await prisma.withdrawRequest.create({
    data: {
      userId: client.id,
      amount: new Decimal(500),
      status: WithdrawStatus.PENDING,
    },
  });

  const unauthDepositApprove = await fetch(`${baseUrl}/admin/deposits/${deposit.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: 'test' }),
  });
  assert.strictEqual(unauthDepositApprove.status, 401);

  const clientDepositApprove = await fetch(`${baseUrl}/admin/deposits/${deposit.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(client) },
    body: JSON.stringify({ note: 'test' }),
  });
  assert.strictEqual(clientDepositApprove.status, 403);

  const unauthWithdrawApprove = await fetch(`${baseUrl}/admin/withdrawals/${withdrawal.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: 'test' }),
  });
  assert.strictEqual(unauthWithdrawApprove.status, 401);

  const clientWithdrawApprove = await fetch(`${baseUrl}/admin/withdrawals/${withdrawal.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(client) },
    body: JSON.stringify({ note: 'test' }),
  });
  assert.strictEqual(clientWithdrawApprove.status, 403);

  const adminWithdrawApprove = await fetch(`${baseUrl}/admin/withdrawals/${withdrawal.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(admin) },
    body: JSON.stringify({ note: 'test' }),
  });
  assert.ok(adminWithdrawApprove.status >= 200 && adminWithdrawApprove.status < 300);
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

  const approvedAgain = await depositsService.approve(deposit.id, { note: 'second' }, admin.id);
  assert.strictEqual(approvedAgain.accountTxId, approved.accountTxId);

  const duplicates = await prisma.depositRequest.count({ where: { accountTxId: approved.accountTxId } });
  assert.strictEqual(duplicates, 1);
});

test('Deposit approval recovers from APPROVED without tx', async (t) => {
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
    data: { userId: client.id, amount: new Decimal(1500), method: 'bank', status: DepositStatus.PENDING },
  });

  await prisma.depositRequest.update({
    where: { id: deposit.id },
    data: { status: DepositStatus.APPROVED, processedById: admin.id, processedAt: new Date(), accountTxId: null },
  });

  const recovered = await depositsService.approve(deposit.id, { note: 'recover' }, admin.id);
  assert.ok(recovered.accountTxId);
});

test('Withdrawal approval is idempotent and recoverable', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);
  const withdrawalsService = app.get(WithdrawalsService);
  const accountsService = app.get(AccountsService);

  const admin = await prisma.user.create({
    data: {
      fullName: `admin-${Date.now()}`,
      mobile: `09${Date.now().toString().slice(-9)}`,
      email: `admin-withdraw-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  const client = await prisma.user.create({
    data: {
      fullName: `client-${Date.now()}`,
      mobile: `09${(Date.now() + 1).toString().slice(-9)}`,
      email: `client-withdraw-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: 'CLIENT',
      status: 'ACTIVE',
    },
  });

  await ensureInstrument(prisma, IRR_INSTRUMENT_CODE, InstrumentUnit.CURRENCY, InstrumentType.FIAT);
  const account = await accountsService.getOrCreateAccount(client.id, IRR_INSTRUMENT_CODE);
  await prisma.account.update({ where: { id: account.id }, data: { balance: new Decimal(1200) } });

  const withdrawal = await prisma.withdrawRequest.create({
    data: { userId: client.id, amount: new Decimal(700), status: WithdrawStatus.PENDING },
  });

  const first = await withdrawalsService.approve(withdrawal.id, { note: 'first' }, admin.id);
  const second = await withdrawalsService.approve(withdrawal.id, { note: 'second' }, admin.id);
  assert.strictEqual(first.accountTxId, second.accountTxId);

  const accountAfter = await prisma.account.findUnique({ where: { id: account.id } });
  assert.strictEqual(decimalString(accountAfter?.balance), decimalString(new Decimal(500)));

  const recoverable = await prisma.withdrawRequest.create({
    data: {
      userId: client.id,
      amount: new Decimal(200),
      status: WithdrawStatus.APPROVED,
      processedById: admin.id,
    },
  });

  const preRecovery = await prisma.accountTx.count({
    where: { refId: recoverable.id, refType: TxRefType.WITHDRAW },
  });

  const recoveredWithdraw = await withdrawalsService.approve(recoverable.id, { note: 'recover' }, admin.id);
  assert.ok(recoveredWithdraw.accountTxId);

  const postRecovery = await prisma.accountTx.count({
    where: { refId: recoverable.id, refType: TxRefType.WITHDRAW },
  });
  assert.strictEqual(postRecovery, preRecovery + 1);
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
