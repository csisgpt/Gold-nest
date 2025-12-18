# Gold Nest Backend

Initial NestJS backend skeleton for an Iranian gold/abshodeh trading platform with multi-asset ledgering (IRR, gold 750eq, coins) and attachment support.

## Tech stack
- Node.js 20+
- NestJS + TypeScript
- PostgreSQL + Prisma (numeric/decimal columns for money and weight)

## Environment
Copy `.env.example` to `.env` and set `DATABASE_URL`, `HOUSE_USER_ID` (default `house-system-user`), and optional `UPLOAD_ROOT` (defaults to `uploads`).

## Getting started
1. Install dependencies: `npm ci`
2. Apply migrations on a fresh database: `npx prisma migrate reset --force`
3. Seed baseline data (idempotent): `npm run prisma:seed`
4. Run tests: `npm test`

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
- `npm run prisma:seed` – run Prisma seed (creates/ensures house user and sample data)
- `npm run db:reset` – drop and recreate the schema using Prisma migrations
- `npm run test:ci` – reset the database then execute the test suite

## Migrations
- Prisma migrations have been squashed into a single baseline for easier bootstrapping. If you cloned the repo before this change, reset your database (`npx prisma migrate reset --force`) to align with the new history.

> Note: Package installation may require network access to npm registry.
