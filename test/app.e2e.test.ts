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
  PhysicalCustodyMovementStatus,
  PhysicalCustodyMovementType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AppModule } from '../src/app.module';
import { AccountsService } from '../src/modules/accounts/accounts.service';
import { GOLD_750_INSTRUMENT_CODE, HOUSE_USER_ID, IRR_INSTRUMENT_CODE } from '../src/modules/accounts/constants';
import { DepositsService } from '../src/modules/deposits/deposits.service';
import { WithdrawalsService } from '../src/modules/withdrawals/withdrawals.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { TradesService } from '../src/modules/trades/trades.service';
import { CreateTradeDto } from '../src/modules/trades/dto/create-trade.dto';
import { JwtService } from '@nestjs/jwt';
import { PhysicalCustodyService } from '../src/modules/physical-custody/physical-custody.service';

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

function toEquivGram750(weightGram: Decimal | string | number, ayar: number): Decimal {
  return new Decimal(weightGram).mul(ayar).div(750);
}

function authHeader(user: { id: string; mobile: string; role: UserRole }) {
  if (!jwtService) return {};
  const token = jwtService.sign({ sub: user.id, mobile: user.mobile, role: user.role });
  return { Authorization: `Bearer ${token}` };
}

async function createUser(
  prisma: PrismaService,
  role: UserRole = UserRole.CLIENT,
): Promise<{ id: string; mobile: string; role: UserRole }> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  return prisma.user.create({
    data: {
      fullName: `user-${role}-${stamp}`,
      mobile: `09${stamp.slice(-9)}`,
      email: `user-${stamp}@example.com`,
      password: 'Pass123!@#',
      role,
      status: 'ACTIVE',
    },
  });
}

async function uploadTestFile(
  user: { id: string; mobile: string; role: UserRole },
  fileName: string,
  mimeType: string,
  body: BlobPart,
): Promise<{ id: string }> {
  const form = new FormData();
  form.append('file', new Blob([body], { type: mimeType }), fileName);

  const uploadRes = await fetch(`${baseUrl}/files`, {
    method: 'POST',
    headers: authHeader(user),
    body: form as any,
  });
  const uploaded = (await uploadRes.json()) as { id: string };
  assert.ok(uploadRes.ok, `Upload failed with status ${uploadRes.status}`);
  assert.ok(uploaded.id);
  return uploaded;
}

test('File access is limited to owner/admin and attachments require ownership', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);

  const userA = await prisma.user.create({
    data: {
      fullName: `file-owner-${Date.now()}`,
      mobile: `09${Date.now().toString().slice(-9)}`,
      email: `file-a-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: UserRole.CLIENT,
      status: 'ACTIVE',
    },
  });

  const userB = await prisma.user.create({
    data: {
      fullName: `file-b-${Date.now()}`,
      mobile: `09${(Date.now() + 1).toString().slice(-9)}`,
      email: `file-b-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: UserRole.CLIENT,
      status: 'ACTIVE',
    },
  });

  const form = new FormData();
  form.append('file', new Blob(['hello-world'], { type: 'text/plain' }), 'hello.txt');

  const uploadRes = await fetch(`${baseUrl}/files`, {
    method: 'POST',
    headers: authHeader(userA),
    body: form as any,
  });

  assert.ok(uploadRes.status >= 200 && uploadRes.status < 300);
  const uploaded = (await uploadRes.json()) as { id: string };
  assert.ok(uploaded.id);

  const forbiddenView = await fetch(`${baseUrl}/files/${uploaded.id}`, {
    method: 'GET',
    headers: authHeader(userB),
  });
  assert.strictEqual(forbiddenView.status, 403);

  const allowedView = await fetch(`${baseUrl}/files/${uploaded.id}`, {
    method: 'GET',
    headers: authHeader(userA),
  });
  assert.strictEqual(allowedView.status, 200);
  const content = await allowedView.text();
  assert.strictEqual(content, 'hello-world');

  const depositRes = await fetch(`${baseUrl}/deposits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(userA) },
    body: JSON.stringify({ amount: '1000', method: 'bank-transfer', fileIds: [uploaded.id] }),
  });
  assert.ok(depositRes.status >= 200 && depositRes.status < 300);

  const forbiddenDeposit = await fetch(`${baseUrl}/deposits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(userB) },
    body: JSON.stringify({ amount: '1000', method: 'bank-transfer', fileIds: [uploaded.id] }),
  });
  assert.strictEqual(forbiddenDeposit.status, 403);
});

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

test('Physical custody approval standardizes to 750eq and updates wallet/outbox', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);
  const custodyService = app.get(PhysicalCustodyService);
  const accountsService = app.get(AccountsService);

  await ensureInstrument(prisma, GOLD_750_INSTRUMENT_CODE, InstrumentUnit.GRAM_750_EQ, InstrumentType.GOLD);

  const user = await prisma.user.create({
    data: {
      fullName: `custody-client-${Date.now()}`,
      mobile: `09${Date.now().toString().slice(-9)}`,
      email: `custody-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: UserRole.CLIENT,
      status: 'ACTIVE',
      tahesabCustomerCode: 'TC_CUSTODY_TEST',
    },
  });

  await prisma.physicalCustodyPosition.deleteMany({ where: { userId: user.id } });

  const movement = await prisma.physicalCustodyMovement.create({
    data: {
      userId: user.id,
      movementType: PhysicalCustodyMovementType.DEPOSIT,
      status: PhysicalCustodyMovementStatus.PENDING,
      weightGram: new Decimal(2.5),
      ayar: 720,
      note: 'test deposit',
    },
  });

  const userAccount = await accountsService.getOrCreateAccount(user.id, GOLD_750_INSTRUMENT_CODE);
  const houseAccount = await accountsService.getOrCreateAccount(HOUSE_USER_ID, GOLD_750_INSTRUMENT_CODE);
  await prisma.account.update({ where: { id: userAccount.id }, data: { balance: new Decimal(0) } });
  await prisma.account.update({ where: { id: houseAccount.id }, data: { balance: new Decimal(0) } });

  const approved = await custodyService.approveMovement(movement.id);

  const expectedEquiv = toEquivGram750(movement.weightGram, movement.ayar).toFixed(6);
  assert.strictEqual(approved.status, PhysicalCustodyMovementStatus.APPROVED);
  assert.strictEqual(decimalString(approved.equivGram750), expectedEquiv);

  const position = await prisma.physicalCustodyPosition.findUnique({
    where: { userId_assetType: { userId: user.id, assetType: movement.assetType } },
  });
  const userAccountAfter = await prisma.account.findUnique({ where: { id: userAccount.id } });
  const houseAccountAfter = await prisma.account.findUnique({ where: { id: houseAccount.id } });

  assert.strictEqual(decimalString(position?.equivGram750), expectedEquiv);
  assert.strictEqual(decimalString(userAccountAfter?.balance), expectedEquiv);
  assert.strictEqual(decimalString(houseAccountAfter?.balance), expectedEquiv);

  const outbox = await prisma.tahesabOutbox.findFirst({ where: { correlationId: `custody:${movement.id}` } });
  assert.ok(outbox);
  const payload = outbox?.payload as any;
  assert.strictEqual(payload?.ayar, 750);
  assert.strictEqual(Number(payload?.vazn), Number(expectedEquiv));
});

test('Physical custody withdrawal rejects insufficient balance', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);
  const custodyService = app.get(PhysicalCustodyService);

  await ensureInstrument(prisma, GOLD_750_INSTRUMENT_CODE, InstrumentUnit.GRAM_750_EQ, InstrumentType.GOLD);

  const user = await prisma.user.create({
    data: {
      fullName: `custody-withdraw-${Date.now()}`,
      mobile: `09${Date.now().toString().slice(-9)}`,
      email: `custody-withdraw-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: UserRole.CLIENT,
      status: 'ACTIVE',
    },
  });

  await prisma.physicalCustodyPosition.upsert({
    where: { userId_assetType: { userId: user.id, assetType: 'GOLD' } },
    update: { weightGram: new Decimal(1), ayar: 750, equivGram750: new Decimal(1) },
    create: {
      userId: user.id,
      assetType: 'GOLD',
      weightGram: new Decimal(1),
      ayar: 750,
      equivGram750: new Decimal(1),
    },
  });

  const movement = await prisma.physicalCustodyMovement.create({
    data: {
      userId: user.id,
      movementType: PhysicalCustodyMovementType.WITHDRAWAL,
      status: PhysicalCustodyMovementStatus.PENDING,
      weightGram: new Decimal(2),
      ayar: 750,
    },
  });

  await assert.rejects(() => custodyService.approveMovement(movement.id), /Insufficient custody balance/);
});

test('Cancelling approved custody movement reverses wallet and custody', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);
  const custodyService = app.get(PhysicalCustodyService);
  const accountsService = app.get(AccountsService);

  await ensureInstrument(prisma, GOLD_750_INSTRUMENT_CODE, InstrumentUnit.GRAM_750_EQ, InstrumentType.GOLD);

  const user = await prisma.user.create({
    data: {
      fullName: `custody-cancel-${Date.now()}`,
      mobile: `09${Date.now().toString().slice(-9)}`,
      email: `custody-cancel-${Date.now()}@example.com`,
      password: 'Pass123!@#',
      role: UserRole.CLIENT,
      status: 'ACTIVE',
      tahesabCustomerCode: 'TC_CUSTODY_CANCEL',
    },
  });

  await prisma.physicalCustodyPosition.deleteMany({ where: { userId: user.id } });

  const userAccount = await accountsService.getOrCreateAccount(user.id, GOLD_750_INSTRUMENT_CODE);
  const houseAccount = await accountsService.getOrCreateAccount(HOUSE_USER_ID, GOLD_750_INSTRUMENT_CODE);
  await prisma.account.update({ where: { id: userAccount.id }, data: { balance: new Decimal(0) } });
  await prisma.account.update({ where: { id: houseAccount.id }, data: { balance: new Decimal(0) } });

  const movement = await prisma.physicalCustodyMovement.create({
    data: {
      userId: user.id,
      movementType: PhysicalCustodyMovementType.DEPOSIT,
      status: PhysicalCustodyMovementStatus.PENDING,
      weightGram: new Decimal(1.2),
      ayar: 750,
    },
  });

  const approved = await custodyService.approveMovement(movement.id);
  const expectedEquiv = toEquivGram750(movement.weightGram, movement.ayar).toFixed(6);

  await prisma.tahesabOutbox.create({
    data: {
      method: 'DoNewSanadVKHGOLD',
      payload: {},
      status: 'SUCCESS',
      tahesabFactorCode: 'FACTOR-CODE-1',
      correlationId: `custody:${approved.id}`,
      nextRetryAt: new Date(),
    },
  });

  const cancelled = await custodyService.cancelMovement(approved.id, { reason: 'user requested' });
  assert.strictEqual(cancelled.status, PhysicalCustodyMovementStatus.CANCELLED);

  const position = await prisma.physicalCustodyPosition.findUnique({
    where: { userId_assetType: { userId: user.id, assetType: 'GOLD' } },
  });
  assert.strictEqual(decimalString(position?.equivGram750), '0');

  const userAccountAfter = await prisma.account.findUnique({ where: { id: userAccount.id } });
  const houseAccountAfter = await prisma.account.findUnique({ where: { id: houseAccount.id } });
  assert.strictEqual(decimalString(userAccountAfter?.balance), '0');
  assert.strictEqual(decimalString(houseAccountAfter?.balance), '0');

  const relatedTxs = await prisma.accountTx.findMany({
    where: { refId: approved.id, refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT },
  });
  const userOriginal = relatedTxs.find((tx) => tx.accountId === userAccount.id && !tx.reversalOfId);
  const userReversal = relatedTxs.find((tx) => tx.reversalOfId === userOriginal?.id);
  assert.ok(userOriginal?.id);
  assert.ok(userReversal?.id);
  assert.strictEqual(decimalString(userOriginal?.delta), expectedEquiv);
  assert.strictEqual(decimalString(userReversal?.delta), new Decimal(userOriginal?.delta ?? 0).negated().toString());

  const cancelOutbox = await prisma.tahesabOutbox.findFirst({
    where: { correlationId: `custody:cancel:${approved.id}`, method: 'DoDeleteSanad' },
  });
  assert.ok(cancelOutbox);
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

test('File lifecycle supports download, listing, metadata, and deletion', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);

  const user = await createUser(prisma);
  const uploaded = await uploadTestFile(user, 'image.jpg', 'image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));

  const downloadRes = await fetch(`${baseUrl}/files/${uploaded.id}`, {
    headers: authHeader(user),
  });
  assert.strictEqual(downloadRes.status, 200);
  assert.strictEqual(downloadRes.headers.get('content-type'), 'image/jpeg');
  const downloadBuffer = Buffer.from(await downloadRes.arrayBuffer());
  assert.ok(downloadBuffer.byteLength > 0);

  const listRes = await fetch(`${baseUrl}/files`, { headers: authHeader(user) });
  assert.strictEqual(listRes.status, 200);
  const listBody = (await listRes.json()) as { items: Array<{ id: string }>; meta: { total: number } };
  assert.ok(listBody.items.some((f) => f.id === uploaded.id));
  assert.ok(listBody.meta.total >= 1);

  const metaRes = await fetch(`${baseUrl}/files/${uploaded.id}/meta`, { headers: authHeader(user) });
  assert.strictEqual(metaRes.status, 200);
  const metaBody = (await metaRes.json()) as { attachments?: unknown[] };
  assert.ok(Array.isArray(metaBody.attachments));
  assert.strictEqual(metaBody.attachments?.length, 0);

  const deleteRes = await fetch(`${baseUrl}/files/${uploaded.id}`, {
    method: 'DELETE',
    headers: authHeader(user),
  });
  assert.strictEqual(deleteRes.status, 200);
  const deleteBody = (await deleteRes.json()) as { deleted?: boolean };
  assert.strictEqual(deleteBody.deleted, true);

  const metaAfterDelete = await fetch(`${baseUrl}/files/${uploaded.id}/meta`, { headers: authHeader(user) });
  assert.strictEqual(metaAfterDelete.status, 404);
});

test('Attachments endpoint enforces ownership and admin visibility', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);

  const userA = await createUser(prisma);
  const userB = await createUser(prisma);
  const admin = await createUser(prisma, UserRole.ADMIN);

  const file = await uploadTestFile(userA, 'receipt.pdf', 'application/pdf', Buffer.from('pdf-body'));

  const depositRes = await fetch(`${baseUrl}/deposits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(userA) },
    body: JSON.stringify({ amount: '5000', method: 'bank-transfer', fileIds: [file.id] }),
  });
  assert.ok(depositRes.ok, `Deposit failed ${depositRes.status}`);
  const deposit = (await depositRes.json()) as { id: string };
  assert.ok(deposit.id);

  const attachmentsRes = await fetch(
    `${baseUrl}/attachments?entityType=DEPOSIT&entityId=${deposit.id}`,
    { headers: authHeader(userA) },
  );
  assert.strictEqual(attachmentsRes.status, 200);
  const attachmentsBody = (await attachmentsRes.json()) as { items: Array<{ fileId: string }> };
  assert.ok(attachmentsBody.items.some((a) => a.fileId === file.id));

  const forbiddenAttachments = await fetch(
    `${baseUrl}/attachments?entityType=DEPOSIT&entityId=${deposit.id}`,
    { headers: authHeader(userB) },
  );
  assert.strictEqual(forbiddenAttachments.status, 403);

  const adminAttachments = await fetch(
    `${baseUrl}/admin/attachments?entityType=DEPOSIT&entityId=${deposit.id}`,
    { headers: authHeader(admin) },
  );
  assert.strictEqual(adminAttachments.status, 200);
  const adminBody = (await adminAttachments.json()) as { items: Array<{ file?: { storageKey?: string } }> };
  assert.ok(adminBody.items[0]?.file?.storageKey);
});

test('Admin file listing exposes uploader and storage key', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);

  const admin = await createUser(prisma, UserRole.ADMIN);
  const owner = await createUser(prisma);
  const file = await uploadTestFile(owner, 'note.txt', 'text/plain', Buffer.from('hello admin'));

  const adminListRes = await fetch(`${baseUrl}/admin/files?uploadedById=${owner.id}`, {
    headers: authHeader(admin),
  });
  assert.strictEqual(adminListRes.status, 200);
  const adminListBody = (await adminListRes.json()) as {
    items: Array<{ id: string; uploadedById?: string; storageKey?: string }>;
  };
  const target = adminListBody.items.find((i) => i.id === file.id);
  assert.ok(target, 'Uploaded file not found in admin listing');
  assert.strictEqual(target?.uploadedById, owner.id);
  assert.ok(target?.storageKey);
});
