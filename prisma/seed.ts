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
    DepositStatus,
    WithdrawStatus,
    CustodyAssetType,
    PhysicalCustodyMovementType,
    PhysicalCustodyMovementStatus,
    GoldLotStatus,
    AttachmentEntityType,
} from '@prisma/client';
import { faker } from '@faker-js/faker/locale/fa';
import * as bcrypt from 'bcrypt';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

const NUM_CLIENTS = 12;
const NUM_FAKE_TRADES = 6;

async function main() {
    console.log('--- Start Seeding GoldNest Application ---');
    const saltRounds = 10;
    const sharedPassword = await bcrypt.hash('Password@123', saltRounds);
    const now = new Date();

    // --- ۱. ایجاد کاربران پایه (Admin, Trader, Client) ---
    console.log('1. Creating base Users...');

    // تعریف متغیرها در دامنه اصلی main
    let adminUser: any;
    let traderUser: any;
    const clients: any[] = [];
    let clientA: any;
    let clientB: any;

    // Upsert برای کاربران اصلی
    adminUser = await prisma.user.upsert({
        where: { mobile: '09120000001' },
        update: {},
        create: {
            fullName: 'مدیر کل سیستم',
            mobile: '09120000001',
            email: 'admin@goldnest.com',
            password: sharedPassword,
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            tahesabCustomerCode: 'TC_ADMIN_001',
        },
    });

    traderUser = await prisma.user.upsert({
        where: { mobile: '09120000002' },
        update: {},
        create: {
            fullName: 'معامله‌گر اصلی',
            mobile: '09120000002',
            email: 'trader@goldnest.com',
            password: sharedPassword,
            role: UserRole.TRADER,
            status: UserStatus.ACTIVE,
            tahesabCustomerCode: 'TC_TRADER_002',
        },
    });

    // ایجاد مشتریان فیک
    for (let i = 1; i <= NUM_CLIENTS; i++) {
        const clientStatus = i % 3 === 0 ? UserStatus.PENDING_APPROVAL : UserStatus.ACTIVE;
        const mobileNumber = `0912${(1000 + i).toString().padStart(4, '0')}${(i + 1).toString().padStart(2, '0')}`;
        const emailAddress = `client${i}_${faker.string.alphanumeric(4)}@faker.com`;

        const client = await prisma.user.create({
            data: {
                fullName: faker.person.fullName(),
                mobile: mobileNumber,
                email: emailAddress,
                password: sharedPassword,
                role: UserRole.CLIENT,
                status: clientStatus,
                tahesabCustomerCode: `TC_CLIENT_${i.toString().padStart(3, '0')}`,
            },
        });
        clients.push(client);
    }
    clientA = clients[0];
    clientB = clients[1];

    // --- ۲. ایجاد ابزارهای معاملاتی (Instrument) ---
    console.log('2. Creating Instruments...');

    let irr: any;
    let gold: any;

    irr = await prisma.instrument.upsert({
        where: { code: 'IRR' },
        update: {},
        create: { code: 'IRR', name: 'ریال ایران', type: InstrumentType.FIAT, unit: InstrumentUnit.CURRENCY },
    });

    gold = await prisma.instrument.upsert({
        where: { code: 'GOLD_GRAM' },
        update: {},
        create: { code: 'GOLD_GRAM', name: 'طلای ۱۸ عیار گرمی', type: InstrumentType.GOLD, unit: InstrumentUnit.GRAM_750_EQ },
    });

    // --- ۳. ایجاد قیمت‌های اولیه (InstrumentPrice) ---
    console.log('3. Creating Instrument Prices...');

    const goldPrice = 3500000;

    await prisma.instrumentPrice.create({
        data: {
            instrumentId: gold.id,
            buyPrice: new Decimal(goldPrice - 50000),
            sellPrice: new Decimal(goldPrice),
            source: 'Exchange Data',
        },
    });


    // --- ۴. ایجاد حساب‌های کاربری (Account) و موجودی اولیه ---
    console.log('4. Creating Accounts and initial Balances...');

    let clientA_irr_account: any;

    clientA_irr_account = await prisma.account.create({
        data: {
            userId: clientA.id,
            instrumentId: irr.id,
            balance: new Decimal(faker.number.int({ min: 10000000, max: 50000000 })),
        },
        select: { id: true, userId: true, instrumentId: true },
    });

    await prisma.account.create({
        data: {
            userId: clientA.id,
            instrumentId: gold.id,
            balance: new Decimal(faker.number.float({ min: 5, max: 20, fractionDigits: 2 })),
        },
        select: { id: true, userId: true, instrumentId: true },
    });

    for (const client of clients.slice(1)) {
        await prisma.account.createMany({
            data: [
                { userId: client.id, instrumentId: irr.id, balance: new Decimal(faker.number.int({ min: 5000000, max: 30000000 })) },
                { userId: client.id, instrumentId: gold.id, balance: new Decimal(faker.number.float({ min: 1, max: 15, fractionDigits: 2 })) },
            ],
        });
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