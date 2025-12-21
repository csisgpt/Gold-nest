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
  AccountReservationStatus,
  LimitReservationStatus,
  PolicyAction,
  PolicyMetric,
  PhysicalCustodyMovementStatus,
  PhysicalCustodyMovementType,
  RemittanceStatus,
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

async function createStoredFile(prisma: PrismaService, uploadedById: string) {
  return prisma.file.create({
    data: {
      uploadedById,
      storageKey: `test-${Date.now()}`,
      fileName: 'test.txt',
      mimeType: 'text/plain',
      sizeBytes: 4,
    },
  });
}

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

async function setAccountBalance(
  prisma: PrismaService,
  accountId: string,
  balance: Decimal.Value,
): Promise<void> {
  await prisma.account.update({
    where: { id: accountId },
    data: { balance: new Decimal(balance), blockedBalance: new Decimal(0) },
  });
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

test('Users cannot access other users\' accounts or gold lots', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);

  const admin = await createUser(prisma, UserRole.ADMIN);
  const userA = await createUser(prisma);
  const userB = await createUser(prisma);

  await prisma.goldLot.create({
    data: {
      userId: userA.id,
      grossWeight: new Decimal(1),
      karat: 750,
      equivGram750: toEquivGram750(1, 750),
      note: 'lot-a',
    },
  });

  const forbiddenAccounts = await fetch(`${baseUrl}/accounts/user/${userA.id}`, {
    method: 'GET',
    headers: authHeader(userB),
  });
  assert.strictEqual(forbiddenAccounts.status, 403);

  const forbiddenLots = await fetch(`${baseUrl}/gold/lots/user/${userA.id}`, {
    method: 'GET',
    headers: authHeader(userB),
  });
  assert.strictEqual(forbiddenLots.status, 403);

  const myLots = await fetch(`${baseUrl}/gold/lots/my`, { headers: authHeader(userA) });
  assert.strictEqual(myLots.status, 200);
  const myLotsJson = (await myLots.json()) as any[];
  assert.ok(Array.isArray(myLotsJson));
  assert.ok(myLotsJson.length >= 1);

  const adminLots = await fetch(`${baseUrl}/gold/lots/user/${userA.id}`, {
    headers: authHeader(admin),
  });
  assert.strictEqual(adminLots.status, 200);
});

test('Admin can cancel pending deposit request', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);

  const admin = await createUser(prisma, UserRole.ADMIN);
  const user = await createUser(prisma);

  const deposit = await prisma.depositRequest.create({
    data: {
      userId: user.id,
      amount: new Decimal(5000),
      method: 'bank',
      note: 'for-cancel',
    },
  });

  const cancelRes = await fetch(`${baseUrl}/admin/deposits/${deposit.id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(admin) },
    body: JSON.stringify({ reason: 'no longer needed' }),
  });

  assert.strictEqual(cancelRes.status, 200);
  const cancelled = (await cancelRes.json()) as { status: string; note?: string };
  assert.strictEqual(cancelled.status, 'CANCELLED');
  assert.ok(cancelled.note?.includes('no longer needed') || cancelled.note === 'for-cancel');
});

test('Admin deposit list is paginated and detail exposes attachments', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);

  const admin = await createUser(prisma, UserRole.ADMIN);
  const user = await createUser(prisma);

  const [depositA, depositB] = await Promise.all([
    prisma.depositRequest.create({
      data: { userId: user.id, amount: new Decimal(1000), method: 'wallet', status: DepositStatus.PENDING },
    }),
    prisma.depositRequest.create({
      data: { userId: user.id, amount: new Decimal(2000), method: 'wallet', status: DepositStatus.APPROVED },
    }),
  ]);

  const file = await createStoredFile(prisma, admin.id);
  await prisma.attachment.create({
    data: {
      entityId: depositA.id,
      entityType: 'DEPOSIT',
      fileId: file.id,
    },
  });

  const listRes = await fetch(`${baseUrl}/admin/deposits?page=1&limit=1`, {
    headers: authHeader(admin),
  });
  assert.strictEqual(listRes.status, 200);
  const listJson = (await listRes.json()) as any;
  assert.ok(listJson.meta?.total >= 2);
  assert.strictEqual(listJson.items.length, 1);

  const detailRes = await fetch(`${baseUrl}/admin/deposits/${depositA.id}`, {
    headers: authHeader(admin),
  });
  assert.strictEqual(detailRes.status, 200);
  const detailJson = (await detailRes.json()) as any;
  assert.ok(Array.isArray(detailJson.attachments));
  assert.strictEqual(detailJson.attachments[0]?.fileId, file.id);
});

test('Admin withdrawal list and detail include pagination and attachments', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);

  const admin = await createUser(prisma, UserRole.ADMIN);
  const user = await createUser(prisma);

  const [withdrawA, withdrawB] = await Promise.all([
    prisma.withdrawRequest.create({
      data: { userId: user.id, amount: new Decimal(3000), bankName: 'bank', status: WithdrawStatus.PENDING },
    }),
    prisma.withdrawRequest.create({
      data: { userId: user.id, amount: new Decimal(4000), bankName: 'bank', status: WithdrawStatus.REJECTED },
    }),
  ]);

  const file = await createStoredFile(prisma, admin.id);
  await prisma.attachment.create({
    data: {
      entityId: withdrawA.id,
      entityType: 'WITHDRAW',
      fileId: file.id,
    },
  });

  const listRes = await fetch(`${baseUrl}/admin/withdrawals?page=1&limit=1&status=${WithdrawStatus.PENDING}`, {
    headers: authHeader(admin),
  });
  assert.strictEqual(listRes.status, 200);
  const listJson = (await listRes.json()) as any;
  assert.ok(listJson.meta?.total >= 1);
  assert.strictEqual(listJson.items.length, 1);

  const detailRes = await fetch(`${baseUrl}/admin/withdrawals/${withdrawA.id}`, { headers: authHeader(admin) });
  assert.strictEqual(detailRes.status, 200);
  const detailJson = (await detailRes.json()) as any;
  assert.ok(Array.isArray(detailJson.attachments));
});

test('Admin can fetch trade detail with attachments and paginated list', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);

  const admin = await createUser(prisma, UserRole.ADMIN);
  const user = await createUser(prisma);

  const instrument = await prisma.instrument.create({
    data: { code: `T-${Date.now()}`, name: 'Test', type: InstrumentType.CURRENCY, unit: InstrumentUnit.KILOGRAM },
  });

  const trade = await prisma.trade.create({
    data: {
      clientId: user.id,
      instrumentId: instrument.id,
      side: TradeSide.BUY,
      status: TradeStatus.PENDING,
      type: 'SPOT',
      settlementMethod: SettlementMethod.CASH,
      quantity: new Decimal(1),
      pricePerUnit: new Decimal(10),
      totalAmount: new Decimal(10),
    },
  });

  const file = await createStoredFile(prisma, admin.id);
  await prisma.attachment.create({
    data: {
      entityId: trade.id,
      entityType: 'TRADE',
      fileId: file.id,
    },
  });

  const listRes = await fetch(`${baseUrl}/admin/trades?page=1&limit=1`, { headers: authHeader(admin) });
  assert.strictEqual(listRes.status, 200);
  const listJson = (await listRes.json()) as any;
  assert.ok(listJson.meta?.total >= 1);
  assert.strictEqual(listJson.items.length, 1);

  const detailRes = await fetch(`${baseUrl}/admin/trades/${trade.id}`, { headers: authHeader(admin) });
  assert.strictEqual(detailRes.status, 200);
  const detailJson = (await detailRes.json()) as any;
  assert.ok(Array.isArray(detailJson.attachments));
});

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
  form.append(
    'file',
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
    'hello.png',
  );

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

  const forbiddenRaw = await fetch(`${baseUrl}/files/${uploaded.id}/raw`, {
    method: 'GET',
    headers: authHeader(userB),
  });
  assert.strictEqual(forbiddenRaw.status, 403);

  const allowedView = await fetch(`${baseUrl}/files/${uploaded.id}`, {
    method: 'GET',
    headers: authHeader(userA),
  });
  assert.strictEqual(allowedView.status, 200);
  const download = (await allowedView.json()) as {
    previewUrl: string;
    downloadUrl: string;
    url?: string;
    method: string;
  };
  assert.strictEqual(download.method, 'raw');
  assert.ok(download.previewUrl.includes('disposition=inline'));
  assert.ok(download.downloadUrl.includes('disposition=attachment'));
  assert.strictEqual(download.url, download.downloadUrl);

  const previewRes = await fetch(download.previewUrl, { headers: authHeader(userA) });
  assert.strictEqual(previewRes.status, 200);
  const previewBuffer = Buffer.from(await previewRes.arrayBuffer());
  assert.ok(previewBuffer.byteLength > 0);

  const contentRes = await fetch(download.downloadUrl, { headers: authHeader(userA) });
  assert.strictEqual(contentRes.status, 200);
  const contentBuffer = Buffer.from(await contentRes.arrayBuffer());
  assert.ok(contentBuffer.byteLength > 0);

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

test('Withdrawal creation reserves funds and limits with idempotency', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);
  const withdrawalsService = app.get(WithdrawalsService);
  const accountsService = app.get(AccountsService);

  const user = await createUser(prisma);
  await ensureInstrument(prisma, IRR_INSTRUMENT_CODE, InstrumentUnit.CURRENCY, InstrumentType.FIAT);
  const account = await accountsService.getOrCreateAccount(user.id, IRR_INSTRUMENT_CODE);
  await prisma.account.update({ where: { id: account.id }, data: { balance: new Decimal(1_000) } });

  const idempotencyKey = `wd-${Date.now()}`;
  const first = await withdrawalsService.createForUser(
    user as any,
    { amount: '500', note: 'reserve', fileIds: [] } as any,
    idempotencyKey,
  );
  const second = await withdrawalsService.createForUser(
    user as any,
    { amount: '500', note: 'reserve-duplicate', fileIds: [] } as any,
    idempotencyKey,
  );

  assert.strictEqual(first?.id, second?.id);

  const reservations = await prisma.accountReservation.findMany({
    where: { refType: TxRefType.WITHDRAW, refId: first.id },
  });
  assert.strictEqual(reservations.length, 1);
  assert.strictEqual(reservations[0]?.status, AccountReservationStatus.RESERVED);

  const accountAfter = await prisma.account.findUnique({ where: { id: account.id } });
  assert.strictEqual(decimalString(accountAfter?.blockedBalance), decimalString(new Decimal(500)));

  const limitReservations = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.WITHDRAW, refId: first.id },
  });
  assert.strictEqual(limitReservations.length, 2);
  limitReservations.forEach((reservation) =>
    assert.strictEqual(reservation.status, LimitReservationStatus.RESERVED),
  );

  const limitUsages = await prisma.limitUsage.findMany({
    where: { userId: user.id, action: 'WITHDRAW_IRR', metric: 'NOTIONAL_IRR' },
  });
  const reservedSum = limitUsages.reduce((sum, usage) => sum.add(usage.reservedAmount), new Decimal(0));
  assert.strictEqual(decimalString(reservedSum), decimalString(new Decimal(500)));
});

test('Withdrawal approval consumes reservations and remains idempotent', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);
  const withdrawalsService = app.get(WithdrawalsService);
  const accountsService = app.get(AccountsService);

  const admin = await createUser(prisma, UserRole.ADMIN);
  const client = await createUser(prisma);
  await ensureInstrument(prisma, IRR_INSTRUMENT_CODE, InstrumentUnit.CURRENCY, InstrumentType.FIAT);
  const account = await accountsService.getOrCreateAccount(client.id, IRR_INSTRUMENT_CODE);
  await prisma.account.update({ where: { id: account.id }, data: { balance: new Decimal(2_000) } });

  const withdrawal = await withdrawalsService.createForUser(
    client as any,
    { amount: '700', note: 'approve-me', fileIds: [] } as any,
    `wd-approve-${Date.now()}`,
  );

  const approved = await withdrawalsService.approve(withdrawal.id, { note: 'approve' }, admin.id);
  const again = await withdrawalsService.approve(withdrawal.id, { note: 'approve-again' }, admin.id);

  assert.strictEqual(approved.accountTxId, again.accountTxId);
  assert.strictEqual(approved.status, WithdrawStatus.APPROVED);

  const accountAfter = await prisma.account.findUnique({ where: { id: account.id } });
  assert.strictEqual(decimalString(accountAfter?.blockedBalance), decimalString(new Decimal(0)));
  assert.strictEqual(decimalString(accountAfter?.balance), decimalString(new Decimal(1_300)));

  const accountReservations = await prisma.accountReservation.findMany({
    where: { refType: TxRefType.WITHDRAW, refId: withdrawal.id },
  });
  accountReservations.forEach((reservation) =>
    assert.strictEqual(reservation.status, AccountReservationStatus.CONSUMED),
  );

  const limitReservations = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.WITHDRAW, refId: withdrawal.id },
  });
  limitReservations.forEach((reservation) =>
    assert.strictEqual(reservation.status, LimitReservationStatus.CONSUMED),
  );

  const limitUsages = await prisma.limitUsage.findMany({
    where: { userId: client.id, action: 'WITHDRAW_IRR', metric: 'NOTIONAL_IRR' },
  });
  limitUsages.forEach((usage) => {
    assert.strictEqual(decimalString(usage.reservedAmount), decimalString(new Decimal(0)));
    assert.strictEqual(decimalString(usage.usedAmount), decimalString(new Decimal(700)));
  });
});

test('Withdrawal rejection releases reservations and blocks approval', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;
  const prisma = app.get(PrismaService);
  const withdrawalsService = app.get(WithdrawalsService);
  const accountsService = app.get(AccountsService);

  const admin = await createUser(prisma, UserRole.ADMIN);
  const client = await createUser(prisma);
  await ensureInstrument(prisma, IRR_INSTRUMENT_CODE, InstrumentUnit.CURRENCY, InstrumentType.FIAT);
  const account = await accountsService.getOrCreateAccount(client.id, IRR_INSTRUMENT_CODE);
  await prisma.account.update({ where: { id: account.id }, data: { balance: new Decimal(900) } });

  const withdrawal = await withdrawalsService.createForUser(
    client as any,
    { amount: '400', note: 'reject-me', fileIds: [] } as any,
    `wd-reject-${Date.now()}`,
  );

  const rejected = await withdrawalsService.reject(withdrawal.id, { note: 'reject' }, admin.id);
  const rejectedAgain = await withdrawalsService.reject(withdrawal.id, { note: 'reject-again' }, admin.id);

  assert.strictEqual(rejected.status, WithdrawStatus.REJECTED);
  assert.strictEqual(rejectedAgain.status, WithdrawStatus.REJECTED);

  const accountAfter = await prisma.account.findUnique({ where: { id: account.id } });
  assert.strictEqual(decimalString(accountAfter?.blockedBalance), decimalString(new Decimal(0)));
  assert.strictEqual(decimalString(accountAfter?.balance), decimalString(new Decimal(900)));

  const accountReservations = await prisma.accountReservation.findMany({
    where: { refType: TxRefType.WITHDRAW, refId: withdrawal.id },
  });
  accountReservations.forEach((reservation) =>
    assert.strictEqual(reservation.status, AccountReservationStatus.RELEASED),
  );

  const limitReservations = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.WITHDRAW, refId: withdrawal.id },
  });
  limitReservations.forEach((reservation) =>
    assert.strictEqual(reservation.status, LimitReservationStatus.RELEASED),
  );

  const limitUsages = await prisma.limitUsage.findMany({
    where: { userId: client.id, action: 'WITHDRAW_IRR', metric: 'NOTIONAL_IRR' },
  });
  limitUsages.forEach((usage) => {
    assert.strictEqual(decimalString(usage.reservedAmount), decimalString(new Decimal(0)));
    assert.strictEqual(decimalString(usage.usedAmount), decimalString(new Decimal(0)));
  });

  await assert.rejects(() => withdrawalsService.approve(withdrawal.id, { note: 'too-late' }, admin.id));
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

  const trade = await tradesService.createForUser({ id: client.id, role: client.role } as any, tradeDto);

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
  const downloadPayload = (await downloadRes.json()) as {
    url: string;
    method: string;
  };
  assert.strictEqual(downloadPayload.method, 'raw');

  const streamRes = await fetch(downloadPayload.url, { headers: authHeader(user) });
  assert.strictEqual(streamRes.status, 200);
  assert.strictEqual(streamRes.headers.get('content-type'), 'image/jpeg');
  const downloadBuffer = Buffer.from(await streamRes.arrayBuffer());
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
  const file = await uploadTestFile(
    owner,
    'note.pdf',
    'application/pdf',
    Buffer.from('hello admin'),
  );

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

test('Wallet BUY trade reserves limits/funds and approves idempotently', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;

  const prisma = app.get(PrismaService);
  const accounts = app.get(AccountsService);

  const admin = await createUser(prisma, UserRole.ADMIN);
  const user = await createUser(prisma);

  const instrument = await prisma.instrument.create({
    data: {
      code: `GOLD-${Date.now()}`,
      name: 'Test Gold',
      type: InstrumentType.GOLD,
      unit: InstrumentUnit.GRAM_750_EQ,
    },
  });

  const userIrr = await accounts.getOrCreateAccount(user.id, IRR_INSTRUMENT_CODE);
  const userAsset = await accounts.getOrCreateAccount(user.id, instrument.code);
  const houseIrr = await accounts.getOrCreateAccount(HOUSE_USER_ID, IRR_INSTRUMENT_CODE);
  const houseAsset = await accounts.getOrCreateAccount(HOUSE_USER_ID, instrument.code);

  await setAccountBalance(prisma, userIrr.id, new Decimal(100000));
  await setAccountBalance(prisma, userAsset.id, new Decimal(0));
  await setAccountBalance(prisma, houseIrr.id, new Decimal(500000));
  await setAccountBalance(prisma, houseAsset.id, new Decimal(50));

  const quantity = new Decimal(2);
  const pricePerUnit = new Decimal(1000);
  const total = quantity.mul(pricePerUnit);
  const idempotencyKey = `trade-${Date.now()}`;

  const createRes = await fetch(`${baseUrl}/trades`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(user),
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      instrumentCode: instrument.code,
      side: TradeSide.BUY,
      quantity: quantity.toString(),
      pricePerUnit: pricePerUnit.toString(),
      settlementMethod: SettlementMethod.WALLET,
    } satisfies CreateTradeDto),
  });
  assert.ok(createRes.ok, `Create trade failed ${createRes.status}`);
  const created = (await createRes.json()) as any;

  const reservations = await prisma.accountReservation.findMany({
    where: { refType: TxRefType.TRADE, refId: created.id },
  });
  assert.strictEqual(reservations.length, 1);
  const irrAfterCreate = await prisma.account.findUnique({ where: { id: userIrr.id } });
  assert.strictEqual(decimalString(irrAfterCreate?.blockedBalance ?? 0), total.toString());

  const limitReservations = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.TRADE, refId: created.id },
  });
  assert.ok(limitReservations.length >= 2);
  assert.ok(limitReservations.every((lr) => lr.status === LimitReservationStatus.RESERVED));

  const createAgain = await fetch(`${baseUrl}/trades`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(user),
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      instrumentCode: instrument.code,
      side: TradeSide.BUY,
      quantity: quantity.toString(),
      pricePerUnit: pricePerUnit.toString(),
      settlementMethod: SettlementMethod.WALLET,
    } satisfies CreateTradeDto),
  });
  const createAgainBody = (await createAgain.json()) as any;
  assert.strictEqual(createAgainBody.id, created.id, 'Idempotent create should reuse trade');

  const approveRes = await fetch(`${baseUrl}/admin/trades/${created.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(admin),
    },
    body: JSON.stringify({}),
  });
  assert.ok(approveRes.ok, `Approve failed ${approveRes.status}`);
  const approved = (await approveRes.json()) as any;
  assert.strictEqual(approved.status, TradeStatus.APPROVED);

  const irrAfterApprove = await prisma.account.findUnique({ where: { id: userIrr.id } });
  const assetAfterApprove = await prisma.account.findUnique({ where: { id: userAsset.id } });
  const txCountAfterApprove = await prisma.accountTx.count({
    where: { refType: TxRefType.TRADE, refId: created.id },
  });
  assert.strictEqual(decimalString(irrAfterApprove?.blockedBalance ?? 0), '0');
  assert.strictEqual(
    decimalString(irrAfterApprove?.balance ?? 0),
    decimalString(new Decimal(100000).minus(total)),
  );
  assert.strictEqual(decimalString(assetAfterApprove?.balance ?? 0), quantity.toString());

  const consumedLimits = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.TRADE, refId: created.id },
  });
  assert.ok(consumedLimits.every((lr) => lr.status === LimitReservationStatus.CONSUMED));

  const limitUsagesAfterApprove = await prisma.limitUsage.findMany({
    where: { userId: user.id, action: PolicyAction.TRADE_BUY },
  });

  const approveAgainRes = await fetch(`${baseUrl}/admin/trades/${created.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(admin),
    },
    body: JSON.stringify({}),
  });
  assert.ok(approveAgainRes.ok, `Second approve failed ${approveAgainRes.status}`);
  const approvedAgain = (await approveAgainRes.json()) as any;
  assert.strictEqual(approvedAgain.status, TradeStatus.APPROVED);
  assert.strictEqual(approvedAgain.approvedAt, approved.approvedAt);

  const irrAfterSecondApprove = await prisma.account.findUnique({ where: { id: userIrr.id } });
  const assetAfterSecondApprove = await prisma.account.findUnique({ where: { id: userAsset.id } });
  const txCountAfterSecondApprove = await prisma.accountTx.count({
    where: { refType: TxRefType.TRADE, refId: created.id },
  });
  assert.strictEqual(decimalString(irrAfterSecondApprove?.blockedBalance ?? 0), '0');
  assert.strictEqual(decimalString(assetAfterSecondApprove?.blockedBalance ?? 0), '0');
  assert.strictEqual(decimalString(irrAfterSecondApprove?.balance ?? 0), decimalString(irrAfterApprove?.balance ?? 0));
  assert.strictEqual(decimalString(assetAfterSecondApprove?.balance ?? 0), decimalString(assetAfterApprove?.balance ?? 0));
  assert.strictEqual(txCountAfterSecondApprove, txCountAfterApprove);

  const limitUsagesAfterSecondApprove = await prisma.limitUsage.findMany({
    where: { userId: user.id, action: PolicyAction.TRADE_BUY },
  });
  assert.strictEqual(limitUsagesAfterSecondApprove.length, limitUsagesAfterApprove.length);
  limitUsagesAfterApprove.forEach((usage) => {
    const match = limitUsagesAfterSecondApprove.find(
      (candidate) =>
        candidate.metric === usage.metric &&
        candidate.period === usage.period &&
        candidate.instrumentKey === usage.instrumentKey,
    );
    assert.ok(match, 'Matching limit usage not found after idempotent approve');
    assert.strictEqual(decimalString(match.usedAmount), decimalString(usage.usedAmount));
    assert.strictEqual(decimalString(match.reservedAmount), decimalString(usage.reservedAmount));
  });
});

test('Wallet SELL trade cancellation releases reservations', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;

  const prisma = app.get(PrismaService);
  const accounts = app.get(AccountsService);

  const admin = await createUser(prisma, UserRole.ADMIN);
  const user = await createUser(prisma);

  const instrument = await prisma.instrument.create({
    data: {
      code: `COIN-${Date.now()}`,
      name: 'Test Coin',
      type: InstrumentType.COIN,
      unit: InstrumentUnit.PIECE,
    },
  });

  const userAsset = await accounts.getOrCreateAccount(user.id, instrument.code);
  const houseIrr = await accounts.getOrCreateAccount(HOUSE_USER_ID, IRR_INSTRUMENT_CODE);
  const houseAsset = await accounts.getOrCreateAccount(HOUSE_USER_ID, instrument.code);

  await setAccountBalance(prisma, userAsset.id, new Decimal(10));
  await setAccountBalance(prisma, houseIrr.id, new Decimal(500000));
  await setAccountBalance(prisma, houseAsset.id, new Decimal(0));

  const quantity = new Decimal(3);
  const pricePerUnit = new Decimal(1500);

  const createRes = await fetch(`${baseUrl}/trades`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(user),
    },
    body: JSON.stringify({
      instrumentCode: instrument.code,
      side: TradeSide.SELL,
      quantity: quantity.toString(),
      pricePerUnit: pricePerUnit.toString(),
      settlementMethod: SettlementMethod.WALLET,
    } satisfies CreateTradeDto),
  });
  assert.ok(createRes.ok, `Create sell failed ${createRes.status}`);
  const created = (await createRes.json()) as any;

  const reservation = await prisma.accountReservation.findMany({
    where: { refType: TxRefType.TRADE, refId: created.id },
  });
  assert.strictEqual(reservation.length, 1);
  const assetAfterCreate = await prisma.account.findUnique({ where: { id: userAsset.id } });
  assert.strictEqual(decimalString(assetAfterCreate?.blockedBalance ?? 0), quantity.toString());

  const cancelRes = await fetch(`${baseUrl}/admin/trades/${created.id}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(admin),
    },
    body: JSON.stringify({ reason: 'no longer needed' }),
  });
  assert.ok(cancelRes.ok, `Cancel failed ${cancelRes.status}`);
  const cancelled = (await cancelRes.json()) as any;
  assert.strictEqual(cancelled.status, TradeStatus.CANCELLED_BY_ADMIN);

  const assetAfterCancel = await prisma.account.findUnique({ where: { id: userAsset.id } });
  assert.strictEqual(decimalString(assetAfterCancel?.blockedBalance ?? 0), '0');

  const releasedLimits = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.TRADE, refId: created.id },
  });
  assert.ok(releasedLimits.every((lr) => lr.status === LimitReservationStatus.RELEASED));
});

test('Remittance lifecycle reserves, settles, and releases correctly', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;

  const prisma = app.get(PrismaService);
  const accounts = app.get(AccountsService);

  const admin = await createUser(prisma, UserRole.ADMIN);
  const sender = await createUser(prisma);
  const receiver = await createUser(prisma);

  const senderAccount = await accounts.getOrCreateAccount(sender.id, IRR_INSTRUMENT_CODE);
  const receiverAccount = await accounts.getOrCreateAccount(receiver.id, IRR_INSTRUMENT_CODE);
  await setAccountBalance(prisma, senderAccount.id, 20000000);
  await setAccountBalance(prisma, receiverAccount.id, 0);

  const idempotencyKey = `remit-${Date.now()}`;
  const createRes = await fetch(`${baseUrl}/remittances`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      ...authHeader(sender),
    },
    body: JSON.stringify({
      toMobile: receiver.mobile,
      instrumentCode: IRR_INSTRUMENT_CODE,
      amount: '1500000',
      note: 'remit test',
    }),
  });
  assert.ok(createRes.ok, `create remittance failed ${createRes.status}`);
  const created = (await createRes.json()) as any;
  assert.strictEqual(created.status, RemittanceStatus.PENDING);

  const duplicate = await fetch(`${baseUrl}/remittances`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      ...authHeader(sender),
    },
    body: JSON.stringify({
      toMobile: receiver.mobile,
      instrumentCode: IRR_INSTRUMENT_CODE,
      amount: '1500000',
    }),
  });
  assert.ok(duplicate.ok);
  const duplicateBody = (await duplicate.json()) as any;
  assert.strictEqual(created.id, duplicateBody.id);

  const senderAfterReserve = await prisma.account.findUnique({ where: { id: senderAccount.id } });
  assert.strictEqual(decimalString(senderAfterReserve?.blockedBalance ?? 0), '1500000');

  const remittanceReservations = await prisma.accountReservation.findMany({
    where: { refType: TxRefType.REMITTANCE, refId: created.id },
  });
  assert.strictEqual(remittanceReservations.length, 1);
  assert.strictEqual(remittanceReservations[0].status, AccountReservationStatus.RESERVED);

  const remittanceLimitReservations = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.REMITTANCE, refId: created.id },
  });
  assert.strictEqual(remittanceLimitReservations.length, 2);
  assert.ok(remittanceLimitReservations.every((lr) => lr.status === LimitReservationStatus.RESERVED));

  const approveRes = await fetch(`${baseUrl}/admin/remittances/${created.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(admin) },
  });
  assert.ok(approveRes.ok, `approve failed ${approveRes.status}`);
  const approved = (await approveRes.json()) as any;
  assert.strictEqual(approved.status, RemittanceStatus.COMPLETED);

  const txCountAfterApprove = await prisma.accountTx.count({
    where: { refType: TxRefType.REMITTANCE, refId: created.id },
  });

  const senderAfterApprove = await prisma.account.findUnique({ where: { id: senderAccount.id } });
  const receiverAfterApprove = await prisma.account.findUnique({ where: { id: receiverAccount.id } });
  assert.strictEqual(decimalString(senderAfterApprove?.blockedBalance ?? 0), '0');
  assert.strictEqual(decimalString(senderAfterApprove?.balance ?? 0), decimalString(new Decimal(20000000).minus(1500000)));
  assert.strictEqual(decimalString(receiverAfterApprove?.balance ?? 0), '1500000');

  const consumedLimits = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.REMITTANCE, refId: created.id },
  });
  assert.ok(consumedLimits.every((lr) => lr.status === LimitReservationStatus.CONSUMED));

  const approveAgain = await fetch(`${baseUrl}/admin/remittances/${created.id}/approve`, {
    method: 'POST',
    headers: { ...authHeader(admin) },
  });
  assert.ok(approveAgain.ok, `second approve failed ${approveAgain.status}`);
  const approveAgainBody = (await approveAgain.json()) as any;
  assert.strictEqual(approveAgainBody.status, RemittanceStatus.COMPLETED);

  const senderAfterSecondApprove = await prisma.account.findUnique({ where: { id: senderAccount.id } });
  const receiverAfterSecondApprove = await prisma.account.findUnique({ where: { id: receiverAccount.id } });
  const txCountAfterSecondApprove = await prisma.accountTx.count({
    where: { refType: TxRefType.REMITTANCE, refId: created.id },
  });
  assert.strictEqual(decimalString(senderAfterSecondApprove?.blockedBalance ?? 0), '0');
  assert.strictEqual(decimalString(senderAfterSecondApprove?.balance ?? 0), decimalString(senderAfterApprove?.balance ?? 0));
  assert.strictEqual(decimalString(receiverAfterSecondApprove?.balance ?? 0), decimalString(receiverAfterApprove?.balance ?? 0));
  assert.strictEqual(txCountAfterSecondApprove, txCountAfterApprove);

  const rejectRemitRes = await fetch(`${baseUrl}/remittances`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(sender),
      'Idempotency-Key': `remit-reject-${Date.now()}`,
    },
    body: JSON.stringify({
      toMobile: receiver.mobile,
      instrumentCode: IRR_INSTRUMENT_CODE,
      amount: '500000',
    }),
  });
  assert.ok(rejectRemitRes.ok);
  const rejectCandidate = (await rejectRemitRes.json()) as any;

  const rejectResponse = await fetch(`${baseUrl}/admin/remittances/${rejectCandidate.id}/reject`, {
    method: 'POST',
    headers: { ...authHeader(admin) },
  });
  assert.ok(rejectResponse.ok, `reject failed ${rejectResponse.status}`);
  const rejected = (await rejectResponse.json()) as any;
  assert.strictEqual(rejected.status, RemittanceStatus.CANCELLED);

  const rejectLimits = await prisma.limitReservation.findMany({ where: { refType: TxRefType.REMITTANCE, refId: rejectCandidate.id } });
  assert.ok(rejectLimits.every((lr) => lr.status === LimitReservationStatus.RELEASED));

  const approveAfterReject = await fetch(`${baseUrl}/admin/remittances/${rejectCandidate.id}/approve`, {
    method: 'POST',
    headers: { ...authHeader(admin) },
  });
  assert.strictEqual(approveAfterReject.status, 400);
});

test('Physical custody lifecycle reserves, settles, and releases', async (t) => {
  const app = await bootstrapApp();
  if (!requireApp(app, t)) return;

  const prisma = app.get(PrismaService);
  const accounts = app.get(AccountsService);

  const admin = await createUser(prisma, UserRole.ADMIN);
  const user = await createUser(prisma);

  const goldAccount = await accounts.getOrCreateAccount(user.id, GOLD_750_INSTRUMENT_CODE);
  await setAccountBalance(prisma, goldAccount.id, 50);

  const outKey = `custody-out-${Date.now()}`;
  const createOut = await fetch(`${baseUrl}/physical-custody/movements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': outKey,
      ...authHeader(user),
    },
    body: JSON.stringify({ movementType: PhysicalCustodyMovementType.WITHDRAWAL, weightGram: 10, ayar: 750 }),
  });
  assert.ok(createOut.ok, `create custody out failed ${createOut.status}`);
  const outMovement = (await createOut.json()) as any;
  assert.strictEqual(outMovement.status, PhysicalCustodyMovementStatus.PENDING);

  const goldAfterReserve = await prisma.account.findUnique({ where: { id: goldAccount.id } });
  assert.strictEqual(decimalString(goldAfterReserve?.blockedBalance ?? 0), '10');

  const custodyLimitRes = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT, refId: outMovement.id },
  });
  assert.strictEqual(custodyLimitRes.length, 2);
  assert.ok(custodyLimitRes.every((r) => r.status === LimitReservationStatus.RESERVED));

  const approveOut = await fetch(`${baseUrl}/physical-custody/movements/${outMovement.id}/approve`, {
    method: 'POST',
    headers: { ...authHeader(admin) },
  });
  assert.ok(approveOut.ok, `approve out failed ${approveOut.status}`);
  const approvedOut = (await approveOut.json()) as any;
  assert.strictEqual(approvedOut.status, PhysicalCustodyMovementStatus.APPROVED);

  const txCountOutAfterApprove = await prisma.accountTx.count({
    where: { refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT, refId: outMovement.id },
  });

  const goldAfterApprove = await prisma.account.findUnique({ where: { id: goldAccount.id } });
  assert.strictEqual(decimalString(goldAfterApprove?.blockedBalance ?? 0), '0');
  assert.strictEqual(decimalString(goldAfterApprove?.balance ?? 0), '40');

  const consumedOutLimits = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT, refId: outMovement.id },
  });
  assert.ok(consumedOutLimits.every((r) => r.status === LimitReservationStatus.CONSUMED));

  const approveOutAgain = await fetch(`${baseUrl}/physical-custody/movements/${outMovement.id}/approve`, {
    method: 'POST',
    headers: { ...authHeader(admin) },
  });
  assert.ok(approveOutAgain.ok, `second approve out failed ${approveOutAgain.status}`);
  const approvedOutAgain = (await approveOutAgain.json()) as any;
  assert.strictEqual(approvedOutAgain.status, PhysicalCustodyMovementStatus.APPROVED);
  assert.strictEqual(approvedOutAgain.userGoldAccountTxId, approvedOut.userGoldAccountTxId);
  assert.strictEqual(approvedOutAgain.houseGoldAccountTxId, approvedOut.houseGoldAccountTxId);

  const goldAfterSecondApprove = await prisma.account.findUnique({ where: { id: goldAccount.id } });
  const txCountOutAfterSecondApprove = await prisma.accountTx.count({
    where: { refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT, refId: outMovement.id },
  });
  assert.strictEqual(decimalString(goldAfterSecondApprove?.blockedBalance ?? 0), '0');
  assert.strictEqual(decimalString(goldAfterSecondApprove?.balance ?? 0), decimalString(goldAfterApprove?.balance ?? 0));
  assert.strictEqual(txCountOutAfterSecondApprove, txCountOutAfterApprove);

  const rejectOutCreate = await fetch(`${baseUrl}/physical-custody/movements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(user),
      'Idempotency-Key': `custody-reject-${Date.now()}`,
    },
    body: JSON.stringify({ movementType: PhysicalCustodyMovementType.WITHDRAWAL, weightGram: 5, ayar: 750 }),
  });
  assert.ok(rejectOutCreate.ok);
  const rejectOutMovement = (await rejectOutCreate.json()) as any;

  const rejectOut = await fetch(`${baseUrl}/physical-custody/movements/${rejectOutMovement.id}/reject`, {
    method: 'POST',
    headers: { ...authHeader(admin) },
    body: JSON.stringify({ reason: 'kyc' }),
  });
  assert.ok(rejectOut.ok, `reject out failed ${rejectOut.status}`);
  const rejectedOutBody = (await rejectOut.json()) as any;
  assert.strictEqual(rejectedOutBody.status, PhysicalCustodyMovementStatus.REJECTED);

  const rejectOutLimits = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT, refId: rejectOutMovement.id },
  });
  assert.ok(rejectOutLimits.every((r) => r.status === LimitReservationStatus.RELEASED));

  const approveAfterReject = await fetch(`${baseUrl}/physical-custody/movements/${rejectOutMovement.id}/approve`, {
    method: 'POST',
    headers: { ...authHeader(admin) },
  });
  assert.strictEqual(approveAfterReject.status, 400);

  const createIn = await fetch(`${baseUrl}/physical-custody/movements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(user),
    },
    body: JSON.stringify({ movementType: PhysicalCustodyMovementType.DEPOSIT, weightGram: 12, ayar: 700 }),
  });
  assert.ok(createIn.ok, `create custody in failed ${createIn.status}`);
  const inMovement = (await createIn.json()) as any;

  const goldAfterInReserve = await prisma.account.findUnique({ where: { id: goldAccount.id } });
  assert.strictEqual(decimalString(goldAfterInReserve?.blockedBalance ?? 0), '0');

  const inLimits = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT, refId: inMovement.id },
  });
  assert.ok(inLimits.every((r) => r.status === LimitReservationStatus.RESERVED));

  const approveIn = await fetch(`${baseUrl}/physical-custody/movements/${inMovement.id}/approve`, {
    method: 'POST',
    headers: { ...authHeader(admin) },
  });
  assert.ok(approveIn.ok, `approve in failed ${approveIn.status}`);
  const approvedIn = (await approveIn.json()) as any;
  assert.strictEqual(approvedIn.status, PhysicalCustodyMovementStatus.APPROVED);

  const goldAfterInApprove = await prisma.account.findUnique({ where: { id: goldAccount.id } });
  assert.strictEqual(decimalString(goldAfterInApprove?.balance ?? 0), decimalString(new Decimal(40).add(toEquivGram750(12, 700))));

  const consumedInLimits = await prisma.limitReservation.findMany({
    where: { refType: TxRefType.PHYSICAL_CUSTODY_MOVEMENT, refId: inMovement.id },
  });
  assert.ok(consumedInLimits.every((r) => r.status === LimitReservationStatus.CONSUMED));
});
