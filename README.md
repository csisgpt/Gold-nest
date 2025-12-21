# Gold Nest Backend

Initial NestJS backend skeleton for an Iranian gold/abshodeh trading platform with multi-asset ledgering (IRR, gold 750eq, coins) and attachment support.

## Tech stack
- Node.js 20+
- NestJS + TypeScript
- PostgreSQL + Prisma (numeric/decimal columns for money and weight)

## Environment
Copy `.env.example` to `.env` and set `DATABASE_URL`, `HOUSE_USER_ID` (default `house-system-user`), and optional `UPLOAD_ROOT` (defaults to `uploads`).

## File storage (Liara Object Storage / S3)
- Local disk storage is intended for development; production deployments should use an S3-compatible object store such as Liara Object Storage.
- Required environment variables:
  - `STORAGE_DRIVER` – `local` for disk or `s3` for Liara/Object Storage.
  - `UPLOAD_ROOT` – local disk folder for the `local` driver (ignored for S3).
  - `LIARA_ENDPOINT` – S3-compatible endpoint URL.
  - `LIARA_BUCKET_NAME` – target bucket name (should be private; access goes through the API for ACL enforcement).
  - `LIARA_ACCESS_KEY` / `LIARA_SECRET_KEY` – credentials for the bucket.
- `LIARA_REGION` – Liara region/namespace (default `default`).
- `FILE_MAX_SIZE_BYTES` – maximum upload size enforced by Multer (default `5000000`).
- `FILE_ALLOWED_MIME` – comma-separated list of allowed MIME types (defaults to `image/jpeg,image/png,application/pdf`).
- `FILE_SIGNED_URL_EXPIRES_SECONDS` – expiry for presigned download URLs (default `60`).
- `PUBLIC_BASE_URL` – optional absolute origin (e.g., `https://api.example.com`) used when constructing raw download URLs.
- `S3_FORCE_PATH_STYLE` – force path-style access for S3-compatible services (default `true`).
- `TRUST_PROXY` – set to `true` when running behind a reverse proxy so download URLs honor forwarded protocol/host headers.

## File uploads/downloads
- Uploads: `POST /files` (multipart form-data: `file` + optional `label`).
- Download link JSON: `GET /files/:id` returns a short-lived descriptor containing `url`, `method` (`presigned` for S3, `raw` for local), and optional `expiresInSeconds`.
- Raw binary: `GET /files/:id/raw` streams the file (auth required). Local storage uses this URL directly; S3 setups typically rely on the presigned link returned by `/files/:id`.
- When using Liara/S3, ensure your `LIARA_ENDPOINT` includes the proper host (with protocol) so presigned links are valid externally, and set `PUBLIC_BASE_URL`/`TRUST_PROXY` appropriately behind reverse proxies.

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
- Files & attachments stored via pluggable storage (local disk or S3-compatible)

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

See [docs/policy.md](docs/policy.md) for policy rule precedence and reservation lifecycle details.
