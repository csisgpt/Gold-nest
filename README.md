# Gold Nest Backend

Initial NestJS backend skeleton for an Iranian gold/abshodeh trading platform with multi-asset ledgering (IRR, gold 750eq, coins) and attachment support.

## Tech stack
- Node.js 20+
- NestJS + TypeScript
- PostgreSQL + Prisma (numeric/decimal columns for money and weight)

## Environment
Copy `.env.example` to `.env` and set `DATABASE_URL` and optional `UPLOAD_ROOT` (defaults to `uploads`).

## Core modules
- Accounts with minBalance/credit rules and double-entry style AccountTx records
- Deposits & Withdrawals with admin approval and wallet debits/credits
- Trades with WALLET settlement ledger postings (house vs client) and hooks for EXTERNAL/CASH
- Gold lots with equivalent 750 gram calculation and ledger postings
- Files & attachments stored on local disk with metadata in Prisma

## Scripts
- `npm run start:dev` – run the app via ts-node
- `npm run build` – compile to `dist`
- `npm run prisma:generate` – generate Prisma client

> Note: Package installation may require network access to npm registry.
