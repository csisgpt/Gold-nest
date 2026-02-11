# Foundation Modules (Hardened)

## API contracts
- Success envelope: `{ ok:true, result:<payload>, traceId, ts }`
- Error envelope: `{ ok:false, result:null, error:{ code, message, details? }, traceId, ts }`
- List contract: admin table endpoints must return `result: { items: T[], meta: PaginationMeta }`.

## Safe DTO rules
- Controllers must not return raw Prisma entities.
- User objects must use a safe mapper and never include `password` or internal auth fields.
- Decimal values in responses are serialized as strings.

## KYC file ownership validation
`POST /me/kyc/submit` validates `fileIds` before creating KYC attachments:
1. de-duplicates `fileIds`
2. verifies all files exist
3. verifies all files are owned by current user (`uploadedById`)
4. creates attachments with `entityType=KYC`, `entityId=currentUser.id`

Error codes:
- `KYC_INVALID_FILE_IDS`
- `KYC_FILES_FORBIDDEN`

## Wallet account DTO shape
All wallet/account list APIs return stable `WalletAccountDto`:
```json
{
  "instrument": { "id": "...", "code": "IRR", "name": "Iranian Rial", "type": "FIAT", "unit": "IRR" },
  "balance": "1200000.000000",
  "blockedBalance": "0.000000",
  "minBalance": "0.000000",
  "available": "1200000.000000",
  "balancesHidden": false,
  "updatedAt": "2026-02-11T10:11:12.000Z"
}
```
Behavior:
- `/accounts/my` and `/me/overview.wallet.accounts`: obey user `showBalances`.
- `/admin/users/:id/overview`: admin sees balances; `wallet.summary.balancesHiddenByUserSetting` indicates user preference.

## Capabilities (frontend-ready)
`/me/overview.capabilities`:
- `canTrade`, `canWithdraw`
- `needsKycForTrade`, `needsKycForWithdraw`
- `reasons: [{ code, message, hint? }]`

Stable reason codes:
- `USER_BLOCKED`
- `SETTINGS_TRADE_DISABLED`
- `SETTINGS_WITHDRAW_DISABLED`
- `KYC_REQUIRED` (with `meta.requiredLevel` = `BASIC|FULL`)
- `INSUFFICIENT_AVAILABLE_IRR`

## Policy summary shape
`GET /me/policy/summary` and `GET /admin/users/:id/policy/summary` include UI-ready keys:
- `withdrawIrr.daily/monthly`
- `tradeBuyNotionalIrr.daily/monthly`
- `tradeSellNotionalIrr.daily/monthly`

Each leaf contains: `{ limit, kycRequiredLevel, source, ruleId }`.

## Statement shape
`GET /accounts/statement` and `GET /admin/accounts/:userId/statement`:
```json
{
  "items": [
    {
      "id": "tx_id",
      "createdAt": "2026-02-11T10:11:12.000Z",
      "refType": "WITHDRAW",
      "refId": "withdraw_id",
      "type": "WITHDRAW",
      "instrumentCode": "IRR",
      "side": "DEBIT",
      "amountMoney": "100000.000000",
      "amountWeight": null,
      "note": "withdraw request",
      "balancesHidden": false
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false }
}
```

## Endpoint catalog highlights
- `GET /me/overview`
- `POST /me/kyc/submit`
- `GET /admin/users`
- `GET /admin/users/:id/overview`
- `GET /admin/users/:id/wallet/accounts`
- `GET /admin/meta/users`
- `GET /admin/tahesab/outbox`

---

## Sample request/response examples

### 1) `GET /me/overview`
```json
{
  "ok": true,
  "result": {
    "user": { "id": "u1", "fullName": "Ali", "mobile": "09...", "email": "a@x.com" },
    "wallet": {
      "accounts": [{ "instrument": { "code": "IRR" }, "balance": null, "balancesHidden": true }],
      "summary": { "balancesHiddenByUserSetting": true, "irrAvailable": null }
    },
    "capabilities": {
      "canTrade": false,
      "canWithdraw": false,
      "needsKycForTrade": "BASIC",
      "needsKycForWithdraw": "FULL",
      "reasons": [{ "code": "KYC_REQUIRED", "message": "KYC level FULL required for withdraw", "meta": { "requiredLevel": "FULL" } }]
    }
  }
}
```

### 2) `GET /admin/users/:id/overview`
```json
{
  "ok": true,
  "result": {
    "user": { "id": "u1", "fullName": "Ali", "email": "a@x.com" },
    "customerGroup": { "id": "g1", "code": "DEFAULT", "name": "Default" },
    "wallet": {
      "accounts": [{ "instrument": { "code": "IRR" }, "balance": "100000.000000", "balancesHidden": false }],
      "summary": { "balancesHiddenByUserSetting": true, "irrAvailable": "100000.000000" }
    },
    "tahesab": { "enabled": true, "customerCode": "C1001" }
  }
}
```

### 3) `GET /admin/users?page=1&limit=20`
```json
{
  "ok": true,
  "result": {
    "items": [{ "id": "u1", "fullName": "Ali", "email": "a@x.com", "kyc": { "status": "PENDING" } }],
    "meta": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false }
  }
}
```

### 4) `POST /me/kyc/submit` ownership error
```json
{
  "ok": false,
  "result": null,
  "error": {
    "code": "KYC_FILES_FORBIDDEN",
    "message": "You do not own one or more files"
  }
}
```

### 5) `GET /admin/tahesab/outbox?page=1&limit=20`
```json
{
  "ok": true,
  "result": {
    "items": [{ "id": "out_1", "method": "DoEditMoshtari", "status": "PENDING" }],
    "meta": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false }
  }
}
```
