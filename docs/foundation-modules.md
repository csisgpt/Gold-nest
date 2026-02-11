# Foundation Modules (Hardened)

## API contract (must keep)
- Success envelope: `{ ok:true, result:<payload>, traceId, ts }`.
- Error envelope: `{ ok:false, result:null, error:{ code, message, details? }, traceId, ts }`.
- Custom business errors must throw `HttpException` payload shape `{ code, message }`.
- Admin table list endpoints must return `result: { items, meta }` using pagination wrap.
- Backward-compatible lookup/list endpoints that previously returned arrays remain unchanged.

## Endpoint catalog
### Foundation / users
- `GET /me/overview`
- `GET /me/kyc`
- `POST /me/kyc/submit`
- `GET /me/policy/summary`
- `GET /admin/users`
- `GET /admin/users/:id/overview`
- `PATCH /admin/users/:id`
- `GET /admin/users/:id/policy/summary`
- `POST /admin/users/:id/wallet/adjust`
- `GET /admin/users/:id/wallet/accounts` (paged)

### Customer groups / policy
- `GET /admin/customer-groups` (legacy array)
- `GET /admin/customer-groups/paged` (admin table, paged `{items,meta}`)
- `POST /admin/customer-groups`
- `PUT /admin/customer-groups/:id`
- `DELETE /admin/customer-groups/:id`
- `GET /admin/customer-groups/:id/users` (paged)
- `POST /admin/customer-groups/:id/users:move`
- `GET /admin/customer-groups/:id/settings`
- `PUT /admin/customer-groups/:id/settings`
- `GET /admin/policy-rules` (paged)
- `POST /admin/policy-rules/bulk-upsert`

### Tahesab admin routes (correct paths)
- `GET /admin/tahesab/outbox`
- `POST /admin/tahesab/outbox/:id/retry`
- `POST /admin/tahesab/users/:id/resync`
- `POST /admin/tahesab/customer-groups/:groupId/resync-users`

## Capabilities behavior (`/me/overview`)
- `capabilities` remains derived from user status + effective settings.
- Additionally policy/KYC-aware gating now applies:
  - required KYC for withdraw is the strictest requirement across withdraw windows.
  - required KYC for trade is the strictest requirement across buy/sell windows.
  - effective user KYC level is treated as `NONE` unless KYC status is `VERIFIED`.
- If KYC is insufficient, capability is disabled and reason includes `KYC_REQUIRED`.
- Response may include `needsKycForWithdraw` and `needsKycForTrade`.

## Error code rules
- Use `ApiErrorCode` values with `{ code, message }` payloads.
- Foundational admin operations use explicit business codes such as:
  - `USER_NOT_FOUND`
  - `GROUP_NOT_FOUND`
  - `GROUP_HAS_USERS`
  - `INVALID_STATUS_TRANSITION`
  - `KYC_ALREADY_VERIFIED`
  - `TAHESAB_DISABLED`
  - `TAHESAB_CUSTOMER_CODE_REQUIRED`
  - `POLICY_RULE_NOT_FOUND`

## Notes
- Decimal/amount fields are serialized as strings.
- Policy bulk-upsert writes audit logs for created/updated rows.
- Customer-group delete and user move operations are audited.
