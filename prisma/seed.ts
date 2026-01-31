import {
    PrismaClient,
    UserRole,
    UserStatus,
    InstrumentType,
    InstrumentUnit,
    RemittanceChannel,
    RemittanceGroupKind,
    RemittanceStatus,
    TradeSide,
    TradeStatus,
    SettlementMethod,
    TxRefType,
    AccountTxType,
    AccountTxEntrySide,
    DepositStatus,
    WithdrawStatus,
    CustodyAssetType,
    PhysicalCustodyMovementType,
    PhysicalCustodyMovementStatus,
    GoldLotStatus,
    AttachmentEntityType,
    PolicyScopeType,
    PolicyAction,
    PolicyMetric,
    PolicyPeriod,
    KycLevel,
    MarketProductType,
    TradeType,
    RequestPurpose,
    PaymentDestinationDirection,
    PaymentDestinationType,
    WithdrawalChannel,
    P2PAllocationStatus,
    PaymentMethod,
    AttachmentLinkEntityType,
    AttachmentLinkKind,
} from '@prisma/client';
import { faker } from '@faker-js/faker/locale/fa';
import * as bcrypt from 'bcrypt';
import { Decimal } from '@prisma/client/runtime/library';
import {
    encryptDestinationValue,
    hashDestinationValue,
    maskDestinationValue,
    normalizeDestinationValue,
} from '../src/modules/payment-destinations/payment-destinations.crypto';

const prisma = new PrismaClient();

const NUM_CLIENTS = 12;
const NUM_FAKE_TRADES = 6;
const HOUSE_USER_ID = process.env.HOUSE_USER_ID || 'house-system-user';

function buildDestinationPayload(value: string) {
    const normalized = normalizeDestinationValue(value);
    return {
        encryptedValue: encryptDestinationValue(normalized),
        encryptedValueHash: hashDestinationValue(normalized),
        maskedValue: maskDestinationValue(normalized),
    };
}

async function main() {
    console.log('--- Start Seeding GoldNest Application ---');
    faker.seed(42);

    const saltRounds = 10;
    const sharedPassword = await bcrypt.hash('Password@123', saltRounds);
    const now = new Date();

    console.log('0. Creating customer groups...');
    const groups = [
        { code: 'STANDARD', name: 'Standard Customers', tahesabGroupName: 'DEFAULT', isDefault: true },
        { code: 'VERIFIED', name: 'Verified Customers', tahesabGroupName: 'VERIFIED', isDefault: false },
        { code: 'VIP', name: 'VIP Customers', tahesabGroupName: 'VIP', isDefault: false },
    ];

    let defaultGroupId: string | undefined;
    const groupMap = new Map<string, string>();
    for (const group of groups) {
        const upserted = await prisma.customerGroup.upsert({
            where: { code: group.code },
            update: {
                name: group.name,
                tahesabGroupName: group.tahesabGroupName,
                isDefault: group.isDefault,
            },
            create: group,
        });
        groupMap.set(group.code, upserted.id);
        if (group.isDefault) {
            defaultGroupId = upserted.id;
        }
    }

    if (defaultGroupId) {
        await prisma.customerGroup.updateMany({
            where: { id: { not: defaultGroupId } },
            data: { isDefault: false },
        });
    }

    // --- ۱. ایجاد کاربران پایه (Admin, Trader, Client) ---
    console.log('1. Creating base Users...');

    const clients: any[] = [];

    // Upsert برای کاربران اصلی
    const houseUser = await prisma.user.upsert({
        where: { id: HOUSE_USER_ID },
        update: {},
        create: {
            id: HOUSE_USER_ID,
            fullName: 'House Account',
            mobile: '09999999999',
            email: 'house-system@goldnest.local',
            password: sharedPassword,
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            customerGroupId: defaultGroupId,
        },
    });

    const adminUser = await prisma.user.upsert({
        where: { mobile: '09120000001' },
        update: {
            fullName: 'مدیر کل سیستم',
            email: 'admin@goldnest.com',
            password: sharedPassword,
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            tahesabCustomerCode: 'TC_ADMIN_001',
            customerGroupId: defaultGroupId,
        },
        create: {
            fullName: 'مدیر کل سیستم',
            mobile: '09120000001',
            email: 'admin@goldnest.com',
            password: sharedPassword,
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            tahesabCustomerCode: 'TC_ADMIN_001',
            customerGroupId: defaultGroupId,
        },
    });

    const traderUser = await prisma.user.upsert({
        where: { mobile: '09120000002' },
        update: {
            fullName: 'معامله‌گر اصلی',
            email: 'trader@goldnest.com',
            password: sharedPassword,
            role: UserRole.TRADER,
            status: UserStatus.ACTIVE,
            tahesabCustomerCode: 'TC_TRADER_002',
            customerGroupId: defaultGroupId,
        },
        create: {
            fullName: 'معامله‌گر اصلی',
            mobile: '09120000002',
            email: 'trader@goldnest.com',
            password: sharedPassword,
            role: UserRole.TRADER,
            status: UserStatus.ACTIVE,
            tahesabCustomerCode: 'TC_TRADER_002',
            customerGroupId: defaultGroupId,
        },
    });

    // ایجاد مشتریان فیک
    for (let i = 1; i <= NUM_CLIENTS; i++) {
        const clientStatus = i % 3 === 0 ? UserStatus.PENDING_APPROVAL : UserStatus.ACTIVE;
        const mobileNumber = `0912${(1000 + i).toString().padStart(4, '0')}${(i + 1).toString().padStart(2, '0')}`;
        const emailAddress = `client${i}@goldnest.local`;

        const client = await prisma.user.upsert({
            where: { mobile: mobileNumber },
            update: {
                fullName: faker.person.fullName(),
                email: emailAddress,
                password: sharedPassword,
                role: UserRole.CLIENT,
                status: clientStatus,
                tahesabCustomerCode: `TC_CLIENT_${i.toString().padStart(3, '0')}`,
                customerGroupId: defaultGroupId,
            },
            create: {
                fullName: faker.person.fullName(),
                mobile: mobileNumber,
                email: emailAddress,
                password: sharedPassword,
                role: UserRole.CLIENT,
                status: clientStatus,
                tahesabCustomerCode: `TC_CLIENT_${i.toString().padStart(3, '0')}`,
                customerGroupId: defaultGroupId,
            },
        });
        clients.push(client);
    }
    const clientA = clients[0];
    const clientB = clients[1];

    if (defaultGroupId) {
        await prisma.user.updateMany({
            where: { customerGroupId: null },
            data: { customerGroupId: defaultGroupId },
        });
    }

    // --- ۲. ایجاد ابزارهای معاملاتی (Instrument) ---
    console.log('2. Creating Instruments...');

    let irr: any;
    let gold: any;
    let coin: any;

    irr = await prisma.instrument.upsert({
        where: { code: 'IRR' },
        update: { name: 'ریال ایران', type: InstrumentType.FIAT, unit: InstrumentUnit.CURRENCY },
        create: { code: 'IRR', name: 'ریال ایران', type: InstrumentType.FIAT, unit: InstrumentUnit.CURRENCY },
    });

    const existingGoldEq = await prisma.instrument.findUnique({ where: { code: 'GOLD_750_EQ' } });
    const legacyGold = await prisma.instrument.findUnique({ where: { code: 'GOLD_GRAM' } });

    if (!existingGoldEq && legacyGold) {
        gold = await prisma.instrument.update({
            where: { id: legacyGold.id },
            data: {
                code: 'GOLD_750_EQ',
                name: 'طلای ۱۸ عیار گرمی',
                type: InstrumentType.GOLD,
                unit: InstrumentUnit.GRAM_750_EQ,
            },
        });
    } else {
        gold = await prisma.instrument.upsert({
            where: { code: 'GOLD_750_EQ' },
            update: {
                name: 'طلای ۱۸ عیار گرمی',
                type: InstrumentType.GOLD,
                unit: InstrumentUnit.GRAM_750_EQ,
            },
            create: {
                code: 'GOLD_750_EQ',
                name: 'طلای ۱۸ عیار گرمی',
                type: InstrumentType.GOLD,
                unit: InstrumentUnit.GRAM_750_EQ,
            },
        });
    }

    coin = await prisma.instrument.upsert({
        where: { code: 'COIN_BAHAR' },
        update: {
            name: 'سکه بهار آزادی',
            type: InstrumentType.COIN,
            unit: InstrumentUnit.PIECE,
        },
        create: {
            code: 'COIN_BAHAR',
            name: 'سکه بهار آزادی',
            type: InstrumentType.COIN,
            unit: InstrumentUnit.PIECE,
        },
    });

    // --- ۳. ایجاد قیمت‌های اولیه (InstrumentPrice) ---
    console.log('3. Creating Instrument Prices...');

    const goldPrice = 3500000;

    const existingGoldPrice = await prisma.instrumentPrice.findFirst({ where: { instrumentId: gold.id } });
    if (!existingGoldPrice) {
        await prisma.instrumentPrice.create({
            data: {
                instrumentId: gold.id,
                buyPrice: new Decimal(goldPrice - 50000),
                sellPrice: new Decimal(goldPrice),
                source: 'Exchange Data',
            },
        });
    }

    console.log('3.b Creating Market Products and Pricing Providers...');
    const manualProvider = await prisma.priceProvider.upsert({
        where: { key: 'MANUAL' },
        update: { displayName: 'Manual Input', isEnabled: true },
        create: { key: 'MANUAL', displayName: 'Manual Input', isEnabled: true },
    });

    const tahesabProvider = await prisma.priceProvider.upsert({
        where: { key: 'TAHESAB' },
        update: { displayName: 'Tahesab', isEnabled: true },
        create: { key: 'TAHESAB', displayName: 'Tahesab', isEnabled: true },
    });

    const cashProduct = await prisma.marketProduct.upsert({
        where: { code: 'CASH_IRR_SPOT' },
        update: {
            displayName: 'وجه نقد ریال',
            productType: MarketProductType.CASH,
            tradeType: TradeType.SPOT,
            baseInstrumentId: irr.id,
            unitType: PolicyMetric.NOTIONAL_IRR,
            groupKey: 'cash',
            sortOrder: 1,
        },
        create: {
            code: 'CASH_IRR_SPOT',
            displayName: 'وجه نقد ریال',
            productType: MarketProductType.CASH,
            tradeType: TradeType.SPOT,
            baseInstrumentId: irr.id,
            unitType: PolicyMetric.NOTIONAL_IRR,
            groupKey: 'cash',
            sortOrder: 1,
        },
    });

    const goldProduct = await prisma.marketProduct.upsert({
        where: { code: 'GOLD_GRAM_FULL' },
        update: {
            displayName: 'طلای ۱۸ عیار',
            productType: MarketProductType.GOLD,
            tradeType: TradeType.SPOT,
            baseInstrumentId: gold.id,
            unitType: PolicyMetric.WEIGHT_750_G,
            groupKey: 'gold',
            sortOrder: 2,
        },
        create: {
            code: 'GOLD_GRAM_FULL',
            displayName: 'طلای ۱۸ عیار',
            productType: MarketProductType.GOLD,
            tradeType: TradeType.SPOT,
            baseInstrumentId: gold.id,
            unitType: PolicyMetric.WEIGHT_750_G,
            groupKey: 'gold',
            sortOrder: 2,
        },
    });

    const coinProduct = await prisma.marketProduct.upsert({
        where: { code: 'COIN_BAHAR_FULL' },
        update: {
            displayName: 'سکه بهار آزادی',
            productType: MarketProductType.COIN,
            tradeType: TradeType.SPOT,
            baseInstrumentId: coin.id,
            unitType: PolicyMetric.COUNT,
            groupKey: 'coin',
            sortOrder: 3,
        },
        create: {
            code: 'COIN_BAHAR_FULL',
            displayName: 'سکه بهار آزادی',
            productType: MarketProductType.COIN,
            tradeType: TradeType.SPOT,
            baseInstrumentId: coin.id,
            unitType: PolicyMetric.COUNT,
            groupKey: 'coin',
            sortOrder: 3,
        },
    });

    const baselineMappings = [
        { productId: cashProduct.id, providerId: manualProvider.id, providerSymbol: 'IRR_MANUAL', priority: 1 },
        { productId: goldProduct.id, providerId: tahesabProvider.id, providerSymbol: 'GOLD_MAIN', priority: 1 },
        { productId: coinProduct.id, providerId: tahesabProvider.id, providerSymbol: 'COIN_MAIN', priority: 1 },
    ];

    for (const mapping of baselineMappings) {
        await prisma.productProviderMapping.upsert({
            where: { productId_providerId: { productId: mapping.productId, providerId: mapping.providerId } },
            update: mapping,
            create: mapping,
        });
    }

    console.log('3.a Creating baseline Policy Rules...');
    const upsertPolicyRule = async (data: any) => {
        const selector = {
            scopeType: data.scopeType,
            scopeUserId: data.scopeUserId ?? null,
            scopeGroupId: data.scopeGroupId ?? null,
            action: data.action,
            metric: data.metric,
            period: data.period,
            instrumentId: data.instrumentId ?? null,
            instrumentType: data.instrumentType ?? null,
        } as const;

        const existing = await prisma.policyRule.findFirst({ where: selector });
        if (existing) {
            await prisma.policyRule.update({
                where: { id: existing.id },
                data: {
                    ...data,
                    scopeUserId: data.scopeUserId ?? null,
                    scopeGroupId: data.scopeGroupId ?? null,
                    instrumentId: data.instrumentId ?? null,
                    instrumentType: data.instrumentType ?? null,
                },
            });
            return existing;
        }

        return prisma.policyRule.create({ data });
    };

    const baselineRules = [
        {
            scopeType: PolicyScopeType.GLOBAL,
            action: PolicyAction.WITHDRAW_IRR,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.DAILY,
            limit: new Decimal(50000000),
            minKycLevel: KycLevel.BASIC,
            priority: 100,
        },
        {
            scopeType: PolicyScopeType.GLOBAL,
            action: PolicyAction.WITHDRAW_IRR,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.MONTHLY,
            limit: new Decimal(150000000),
            minKycLevel: KycLevel.BASIC,
            priority: 100,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('STANDARD'),
            action: PolicyAction.WITHDRAW_IRR,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.DAILY,
            limit: new Decimal(10000000),
            minKycLevel: KycLevel.NONE,
            priority: 90,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('STANDARD'),
            action: PolicyAction.WITHDRAW_IRR,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.MONTHLY,
            limit: new Decimal(30000000),
            minKycLevel: KycLevel.NONE,
            priority: 90,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('STANDARD'),
            action: PolicyAction.TRADE_BUY,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.DAILY,
            limit: new Decimal(50000000),
            priority: 90,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('STANDARD'),
            action: PolicyAction.TRADE_BUY,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.MONTHLY,
            limit: new Decimal(1500000000),
            priority: 90,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('STANDARD'),
            action: PolicyAction.TRADE_SELL,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.DAILY,
            limit: new Decimal(50000000),
            priority: 90,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('STANDARD'),
            action: PolicyAction.TRADE_SELL,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.MONTHLY,
            limit: new Decimal(1500000000),
            priority: 90,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('VIP'),
            action: PolicyAction.WITHDRAW_IRR,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.DAILY,
            limit: new Decimal(200000000),
            minKycLevel: KycLevel.FULL,
            priority: 80,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('VIP'),
            action: PolicyAction.WITHDRAW_IRR,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.MONTHLY,
            limit: new Decimal(600000000),
            minKycLevel: KycLevel.FULL,
            priority: 80,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('STANDARD'),
            action: PolicyAction.REMITTANCE_SEND,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.DAILY,
            limit: new Decimal(10000000),
            priority: 90,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('STANDARD'),
            action: PolicyAction.REMITTANCE_SEND,
            metric: PolicyMetric.NOTIONAL_IRR,
            period: PolicyPeriod.MONTHLY,
            limit: new Decimal(50000000),
            priority: 90,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('STANDARD'),
            action: PolicyAction.CUSTODY_OUT,
            metric: PolicyMetric.WEIGHT_750_G,
            period: PolicyPeriod.DAILY,
            limit: new Decimal(5000),
            priority: 90,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('STANDARD'),
            action: PolicyAction.CUSTODY_OUT,
            metric: PolicyMetric.WEIGHT_750_G,
            period: PolicyPeriod.MONTHLY,
            limit: new Decimal(20000),
            priority: 90,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('STANDARD'),
            action: PolicyAction.CUSTODY_IN,
            metric: PolicyMetric.WEIGHT_750_G,
            period: PolicyPeriod.DAILY,
            limit: new Decimal(5000),
            priority: 90,
        },
        {
            scopeType: PolicyScopeType.GROUP,
            scopeGroupId: groupMap.get('STANDARD'),
            action: PolicyAction.CUSTODY_IN,
            metric: PolicyMetric.WEIGHT_750_G,
            period: PolicyPeriod.MONTHLY,
            limit: new Decimal(20000),
            priority: 90,
        },
    ];

    for (const rule of baselineRules) {
        await upsertPolicyRule({
            enabled: true,
            ...rule,
        });
    }


    // --- ۴. ایجاد حساب‌های کاربری (Account) و موجودی اولیه ---
    console.log('4. Creating Accounts and initial Balances...');

    const upsertAccount = async (userId: string, instrumentId: string, balance: Decimal) => {
        return prisma.account.upsert({
            where: { userId_instrumentId: { userId, instrumentId } },
            update: { balance },
            create: { userId, instrumentId, balance },
            select: { id: true, userId: true, instrumentId: true },
        });
    };

    const clientA_irr_account = await upsertAccount(
        clientA.id,
        irr.id,
        new Decimal(faker.number.int({ min: 10000000, max: 50000000 })),
    );

    await upsertAccount(
        clientA.id,
        gold.id,
        new Decimal(faker.number.float({ min: 5, max: 20, fractionDigits: 2 })),
    );

    for (const client of clients.slice(1)) {
        await upsertAccount(
            client.id,
            irr.id,
            new Decimal(faker.number.int({ min: 5000000, max: 30000000 })),
        );
        await upsertAccount(
            client.id,
            gold.id,
            new Decimal(faker.number.float({ min: 1, max: 15, fractionDigits: 2 })),
        );
    }

    const existingTrades = await prisma.trade.count();
    if (existingTrades > 0) {
        console.log('Sample transactional data already present, skipping duplicate inserts.');
        return;
    }


    // --- ۵. ایجاد درخواست‌های واریز/برداشت (Deposit/Withdraw) ---
    console.log('5. Creating Deposit and Withdraw Requests...');

    await prisma.depositRequest.create({
        data: {
            userId: clientA.id,
            amount: new Decimal(1000000),
            method: 'بانکی - شبا',
            status: DepositStatus.PENDING,
            refNo: faker.finance.accountNumber(10),
            note: 'انتظار تأیید رسید',
        },
    });

    const withdrawTx = await prisma.accountTx.create({
        data: {
            accountId: clientA_irr_account.id,
            delta: new Decimal(-2000000),
            type: AccountTxType.WITHDRAW,
            entrySide: AccountTxEntrySide.DEBIT,
            refType: TxRefType.WITHDRAW,
            createdById: adminUser.id,
        },
    });
    await prisma.withdrawRequest.create({
        data: {
            userId: clientA.id,
            amount: new Decimal(2000000),
            status: WithdrawStatus.APPROVED,
            iban: faker.finance.iban({ formatted: true }),
            processedById: adminUser.id,
            processedAt: now,
            accountTxId: withdrawTx.id,
        },
    });

    // --- ۶. ایجاد معاملات (Trades) ---
    console.log('6. Creating Trades...');

    const trades: Array<{ id: string }> = []; // تعریف در دامنه اصلی main

    for (let i = 0; i < NUM_FAKE_TRADES; i++) {
        const side = i % 2 === 0 ? TradeSide.BUY : TradeSide.SELL;
        const tradeStatus = i < 4 ? TradeStatus.APPROVED : TradeStatus.PENDING;

        const quantity = faker.number.float({ min: 1, max: 10, fractionDigits: 3 });
        const price = side === TradeSide.BUY ? goldPrice : goldPrice - 50000;
        const totalAmount = new Decimal(quantity).mul(price);

        const trade = await prisma.trade.create({
            data: {
                // 💡 رفع خطای TS2322: برای Instrument، به جای instrumentId، از فیلد رابطه instrument استفاده می‌کنیم
                client: { connect: { id: clientA.id } },
                instrument: { connect: { id: gold.id } },
                side: side,
                status: tradeStatus,
                settlementMethod: SettlementMethod.WALLET,
                quantity: new Decimal(quantity),
                pricePerUnit: new Decimal(price),
                totalAmount: totalAmount,
                clientNote: `معامله شماره ${i + 1} - ${side}`,
                approvedBy: tradeStatus === TradeStatus.APPROVED ? { connect: { id: traderUser.id } } : undefined,
                approvedAt: tradeStatus === TradeStatus.APPROVED ? now : undefined,
            },
            select: { id: true }
        });
        trades.push(trade);
    }


    // --- ۷. ایجاد حوالجات و تسویه (Remittances & Settlements) ---
    console.log('7. Creating Remittance Groups and Legs...');

    // گروه ۱: انتقال ساده (COMPLETED)
    const transferGroup = await prisma.remittanceGroup.create({
        data: {
            createdBy: { connect: { id: clientA.id } },
            note: 'انتقال وجه ساده',
            kind: RemittanceGroupKind.TRANSFER,
            status: 'CLOSED',
            legs: {
                create: [
                    {
                        fromUser: { connect: { id: clientA.id } },
                        toUser: { connect: { id: clientB.id } },
                        instrument: { connect: { id: irr.id } },
                        amount: new Decimal(200000),
                        channel: RemittanceChannel.INTERNAL,
                        status: RemittanceStatus.COMPLETED,
                    },
                    {
                        fromUser: { connect: { id: clientA.id } },
                        toUser: { connect: { id: clientB.id } },
                        instrument: { connect: { id: gold.id } },
                        amount: new Decimal(0.5),
                        channel: RemittanceChannel.INTERNAL,
                        status: RemittanceStatus.COMPLETED,
                    },
                ]
            }
        },
    });

    // حواله باز (PENDING)
    const pendingRemittance = await prisma.remittance.create({
        data: {
            fromUser: { connect: { id: clientA.id } },
            toUser: { connect: { id: traderUser.id } },
            instrument: { connect: { id: irr.id } },
            amount: new Decimal(1000000),
            channel: RemittanceChannel.BANK_TRANSFER,
            iban: faker.finance.iban({ formatted: true }),
            status: RemittanceStatus.PENDING,
            note: 'صورتحساب باز، نیاز به تسویه',
        },
    });

    // گروه ۲: تسویه جزئی (PARTIAL SETTLEMENT)
    const settlementGroup = await prisma.remittanceGroup.create({
        data: {
            createdBy: { connect: { id: clientB.id } },
            note: 'تسویه جزئی حواله باز',
            kind: RemittanceGroupKind.SETTLEMENT,
            status: 'PARTIAL',
            legs: {
                create: {
                    fromUser: { connect: { id: clientB.id } },
                    toUser: { connect: { id: clientA.id } },
                    instrument: { connect: { id: irr.id } },
                    amount: new Decimal(500000), // تسویه جزئی
                    channel: RemittanceChannel.INTERNAL,
                    status: RemittanceStatus.COMPLETED,
                    settlementsAsLeg: {
                        create: {
                            sourceRemittance: { connect: { id: pendingRemittance.id } },
                            amount: new Decimal(500000),
                            note: 'تسویه ۵۰٪',
                        }
                    }
                }
            }
        },
        include: { legs: true }
    });

    // به‌روزرسانی وضعیت حواله باز به PARTIAL
    if (settlementGroup.legs.length > 0) {
        await prisma.remittance.update({
            where: { id: pendingRemittance.id },
            data: { status: RemittanceStatus.PARTIAL },
        });
    }


    // --- ۸. مدیریت فیزیکی طلا (Custody & GoldLot) ---
    console.log('8. Creating Gold Lots and Physical Custody...');

    // ایجاد پوزیشن حضانت فیزیکی
    await prisma.physicalCustodyPosition.upsert({
        where: { userId_assetType: { userId: clientA.id, assetType: CustodyAssetType.GOLD } },
        update: {},
        create: {
            user: { connect: { id: clientA.id } },
            assetType: CustodyAssetType.GOLD,
            weightGram: new Decimal(100), // ۱۰۰ گرم طلا
            ayar: 750,
        },
    });

    // ایجاد چند لات طلا (GoldLot)
    await prisma.goldLot.createMany({
        data: [
            { userId: clientA.id, grossWeight: 10, karat: 750, equivGram750: 10, status: GoldLotStatus.IN_VAULT, note: 'موجود در خزانه' },
            { userId: clientA.id, grossWeight: 5, karat: 750, equivGram750: 5, status: GoldLotStatus.SOLD, note: 'فروخته شده' },
        ],
    });

    // ایجاد حرکت حضانت فیزیکی (PhysicalCustodyMovement)
    await prisma.physicalCustodyMovement.create({
        data: {
            user: { connect: { id: clientA.id } },
            assetType: CustodyAssetType.GOLD,
            movementType: PhysicalCustodyMovementType.WITHDRAWAL,
            status: PhysicalCustodyMovementStatus.PENDING,
            weightGram: new Decimal(10),
            ayar: 750,
            note: 'درخواست برداشت ۱۰ گرم طلا',
        },
    });


    // --- ۹. فایل‌ها و اتچمنت‌ها ---
    console.log('9. Creating Files and Attachments...');

    const file1 = await prisma.file.create({
        data: {
            uploadedBy: { connect: { id: adminUser.id } },
            storageKey: faker.system.fileName(),
            fileName: 'TradeInvoice.pdf',
            mimeType: 'application/pdf',
            sizeBytes: faker.number.int({ min: 50000, max: 500000 }),
            label: 'فاکتور معامله',
        },
    });

    if (trades.length > 0) {
        await prisma.attachment.create({
            data: {
                file: { connect: { id: file1.id } },
                entityType: AttachmentEntityType.TRADE,
                entityId: trades[0].id,
                purpose: 'فاکتور اصلی',
            },
        });
    }
    // 💡 رفع خطای TS1128: این خط اضافی از اجرای قبلی حذف شد
    // }

    // --- ۱۰. P2P withdrawals/deposits/allocations demo ---
    console.log('10. Creating P2P demo data...');

    const receiver1 = clients[0];
    const receiver2 = clients[1];
    const payer1 = clients[2];
    const payer2 = clients[3];

    const destination1Value = faker.finance.iban({ formatted: false });
    const destination2Value = faker.finance.creditCardNumber();
    const destination3Value = faker.finance.iban({ formatted: false });
    const destination4Value = faker.finance.creditCardNumber();

    const destination1 = await prisma.paymentDestination.create({
        data: {
            ownerUserId: receiver1.id,
            direction: PaymentDestinationDirection.PAYOUT,
            type: PaymentDestinationType.IBAN,
            bankName: 'Mellat',
            ownerName: receiver1.fullName,
            title: 'حساب اصلی',
            isDefault: true,
            ...buildDestinationPayload(destination1Value),
        },
    });

    await prisma.paymentDestination.create({
        data: {
            ownerUserId: receiver1.id,
            direction: PaymentDestinationDirection.PAYOUT,
            type: PaymentDestinationType.CARD,
            bankName: 'Tejarat',
            ownerName: receiver1.fullName,
            title: 'کارت پشتیبان',
            ...buildDestinationPayload(destination2Value),
        },
    });

    const destination3 = await prisma.paymentDestination.create({
        data: {
            ownerUserId: receiver2.id,
            direction: PaymentDestinationDirection.PAYOUT,
            type: PaymentDestinationType.IBAN,
            bankName: 'Saman',
            ownerName: receiver2.fullName,
            title: 'حساب اصلی',
            isDefault: true,
            ...buildDestinationPayload(destination3Value),
        },
    });

    await prisma.paymentDestination.create({
        data: {
            ownerUserId: receiver2.id,
            direction: PaymentDestinationDirection.PAYOUT,
            type: PaymentDestinationType.CARD,
            bankName: 'Pasargad',
            ownerName: receiver2.fullName,
            title: 'کارت پشتیبان',
            ...buildDestinationPayload(destination4Value),
        },
    });

    await prisma.paymentDestination.create({
        data: {
            ownerUserId: null,
            direction: PaymentDestinationDirection.COLLECTION,
            type: PaymentDestinationType.IBAN,
            bankName: 'Central Bank',
            ownerName: 'GoldNest Org',
            title: 'حساب سازمان',
            ...buildDestinationPayload(faker.finance.iban({ formatted: false })),
        },
    });

    const p2pWithdrawal1 = await prisma.withdrawRequest.create({
        data: {
            userId: receiver1.id,
            amount: new Decimal(5000000),
            purpose: RequestPurpose.P2P,
            channel: WithdrawalChannel.USER_TO_USER,
            status: WithdrawStatus.WAITING_ASSIGNMENT,
            payoutDestinationId: destination1.id,
            destinationSnapshot: {
                type: PaymentDestinationType.IBAN,
                value: destination1Value,
                maskedValue: maskDestinationValue(destination1Value),
                bankName: 'Mellat',
                ownerName: receiver1.fullName,
                title: 'حساب اصلی',
            },
        },
    });

    const p2pWithdrawal2 = await prisma.withdrawRequest.create({
        data: {
            userId: receiver2.id,
            amount: new Decimal(6000000),
            purpose: RequestPurpose.P2P,
            channel: WithdrawalChannel.USER_TO_USER,
            status: WithdrawStatus.PARTIALLY_ASSIGNED,
            payoutDestinationId: destination3.id,
            destinationSnapshot: {
                type: PaymentDestinationType.IBAN,
                value: destination3Value,
                maskedValue: maskDestinationValue(destination3Value),
                bankName: 'Saman',
                ownerName: receiver2.fullName,
                title: 'حساب اصلی',
            },
            assignedAmountTotal: new Decimal(4500000),
            settledAmountTotal: new Decimal(0),
        },
    });

    const p2pWithdrawal3 = await prisma.withdrawRequest.create({
        data: {
            userId: receiver1.id,
            amount: new Decimal(2000000),
            purpose: RequestPurpose.P2P,
            channel: WithdrawalChannel.USER_TO_USER,
            status: WithdrawStatus.FULLY_ASSIGNED,
            payoutDestinationId: destination1.id,
            destinationSnapshot: {
                type: PaymentDestinationType.IBAN,
                value: destination1Value,
                maskedValue: maskDestinationValue(destination1Value),
                bankName: 'Mellat',
                ownerName: receiver1.fullName,
                title: 'حساب اصلی',
            },
            assignedAmountTotal: new Decimal(2000000),
            settledAmountTotal: new Decimal(0),
        },
    });

    const depositOffer1 = await prisma.depositRequest.create({
        data: {
            userId: payer1.id,
            amount: new Decimal(2000000),
            method: 'bank-transfer',
            purpose: RequestPurpose.P2P,
            status: DepositStatus.FULLY_ASSIGNED,
            remainingAmount: new Decimal(0),
            assignedAmountTotal: new Decimal(2000000),
            settledAmountTotal: new Decimal(0),
        },
    });

    const depositOffer2 = await prisma.depositRequest.create({
        data: {
            userId: payer2.id,
            amount: new Decimal(1500000),
            method: 'card-to-card',
            purpose: RequestPurpose.P2P,
            status: DepositStatus.PARTIALLY_ASSIGNED,
            remainingAmount: new Decimal(500000),
            assignedAmountTotal: new Decimal(1000000),
            settledAmountTotal: new Decimal(0),
        },
    });

    const depositOffer3 = await prisma.depositRequest.create({
        data: {
            userId: payer1.id,
            amount: new Decimal(1000000),
            method: 'bank-transfer',
            purpose: RequestPurpose.P2P,
            status: DepositStatus.FULLY_ASSIGNED,
            remainingAmount: new Decimal(0),
            assignedAmountTotal: new Decimal(1000000),
            settledAmountTotal: new Decimal(0),
        },
    });

    const depositOffer5 = await prisma.depositRequest.create({
        data: {
            userId: payer1.id,
            amount: new Decimal(500000),
            method: 'bank-transfer',
            purpose: RequestPurpose.P2P,
            status: DepositStatus.FULLY_ASSIGNED,
            remainingAmount: new Decimal(0),
            assignedAmountTotal: new Decimal(500000),
            settledAmountTotal: new Decimal(0),
        },
    });

    const depositOffer4 = await prisma.depositRequest.create({
        data: {
            userId: payer2.id,
            amount: new Decimal(2000000),
            method: 'card-to-card',
            purpose: RequestPurpose.P2P,
            status: DepositStatus.FULLY_ASSIGNED,
            remainingAmount: new Decimal(0),
            assignedAmountTotal: new Decimal(2000000),
            settledAmountTotal: new Decimal(0),
        },
    });

    const allocationAssigned = await prisma.p2PAllocation.create({
        data: {
            withdrawalId: p2pWithdrawal2.id,
            depositId: depositOffer1.id,
            amount: new Decimal(2000000),
            status: P2PAllocationStatus.ASSIGNED,
            paymentCode: faker.string.alphanumeric(8).toUpperCase(),
            expiresAt: new Date(Date.now() + 1000 * 60 * 30),
            destinationSnapshot: p2pWithdrawal2.destinationSnapshot,
            paymentMethod: PaymentMethod.UNKNOWN,
        },
    });

    const proofFile = await prisma.file.create({
        data: {
            uploadedById: payer2.id,
            storageKey: faker.system.fileName(),
            fileName: 'p2p-proof.png',
            mimeType: 'image/png',
            sizeBytes: faker.number.int({ min: 5000, max: 15000 }),
            label: 'رسید واریز',
        },
    });

    const allocationProof = await prisma.p2PAllocation.create({
        data: {
            withdrawalId: p2pWithdrawal2.id,
            depositId: depositOffer2.id,
            amount: new Decimal(1000000),
            status: P2PAllocationStatus.PROOF_SUBMITTED,
            paymentCode: faker.string.alphanumeric(8).toUpperCase(),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 6),
            destinationSnapshot: p2pWithdrawal2.destinationSnapshot,
            paymentMethod: PaymentMethod.CARD_TO_CARD,
            payerBankRef: 'REF-001',
            payerPaidAt: new Date(),
            proofSubmittedAt: new Date(),
        },
    });

    await prisma.attachmentLink.create({
        data: {
            entityType: AttachmentLinkEntityType.P2P_ALLOCATION,
            entityId: allocationProof.id,
            kind: AttachmentLinkKind.P2P_PROOF,
            fileId: proofFile.id,
            uploaderUserId: payer2.id,
        },
    });

    const allocationConfirmed = await prisma.p2PAllocation.create({
        data: {
            withdrawalId: p2pWithdrawal2.id,
            depositId: depositOffer3.id,
            amount: new Decimal(1000000),
            status: P2PAllocationStatus.RECEIVER_CONFIRMED,
            paymentCode: faker.string.alphanumeric(8).toUpperCase(),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
            destinationSnapshot: p2pWithdrawal2.destinationSnapshot,
            paymentMethod: PaymentMethod.SATNA,
            payerBankRef: 'REF-002',
            payerPaidAt: new Date(Date.now() - 1000 * 60 * 30),
            proofSubmittedAt: new Date(Date.now() - 1000 * 60 * 30),
            receiverConfirmedAt: new Date(Date.now() - 1000 * 60 * 10),
        },
    });

    const allocationProof2 = await prisma.p2PAllocation.create({
        data: {
            withdrawalId: p2pWithdrawal3.id,
            depositId: depositOffer4.id,
            amount: new Decimal(2000000),
            status: P2PAllocationStatus.PROOF_SUBMITTED,
            paymentCode: faker.string.alphanumeric(8).toUpperCase(),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8),
            destinationSnapshot: p2pWithdrawal3.destinationSnapshot,
            paymentMethod: PaymentMethod.TRANSFER,
            payerBankRef: 'REF-003',
            payerPaidAt: new Date(Date.now() - 1000 * 60 * 40),
            proofSubmittedAt: new Date(Date.now() - 1000 * 60 * 35),
        },
    });

    const disputeFile = await prisma.file.create({
        data: {
            uploadedById: receiver2.id,
            storageKey: faker.system.fileName(),
            fileName: 'p2p-dispute.pdf',
            mimeType: 'application/pdf',
            sizeBytes: faker.number.int({ min: 10000, max: 50000 }),
            label: 'اعتراض',
        },
    });

    const allocationDisputed = await prisma.p2PAllocation.create({
        data: {
            withdrawalId: p2pWithdrawal2.id,
            depositId: depositOffer5.id,
            amount: new Decimal(500000),
            status: P2PAllocationStatus.DISPUTED,
            paymentCode: faker.string.alphanumeric(8).toUpperCase(),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 4),
            destinationSnapshot: p2pWithdrawal2.destinationSnapshot,
            paymentMethod: PaymentMethod.PAYA,
            payerBankRef: 'REF-004',
            payerPaidAt: new Date(Date.now() - 1000 * 60 * 50),
            proofSubmittedAt: new Date(Date.now() - 1000 * 60 * 45),
            receiverDisputedAt: new Date(Date.now() - 1000 * 60 * 20),
            receiverDisputeReason: 'پرداخت ناقص بود',
        },
    });

    await prisma.attachmentLink.create({
        data: {
            entityType: AttachmentLinkEntityType.P2P_ALLOCATION,
            entityId: allocationDisputed.id,
            kind: AttachmentLinkKind.DISPUTE_EVIDENCE,
            fileId: disputeFile.id,
            uploaderUserId: receiver2.id,
        },
    });

    console.log('P2P demo IDs:', {
        p2pWithdrawal1: p2pWithdrawal1.id,
        p2pWithdrawal2: p2pWithdrawal2.id,
        p2pWithdrawal3: p2pWithdrawal3.id,
        depositOffer1: depositOffer1.id,
        depositOffer2: depositOffer2.id,
        depositOffer3: depositOffer3.id,
        depositOffer4: depositOffer4.id,
        depositOffer5: depositOffer5.id,
        allocationAssigned: allocationAssigned.id,
        allocationProof: allocationProof.id,
        allocationProof2: allocationProof2.id,
        allocationConfirmed: allocationConfirmed.id,
        allocationDisputed: allocationDisputed.id,
        proofFile: proofFile.id,
        disputeFile: disputeFile.id,
    });


    console.log('--- Seeding finished successfully! ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
