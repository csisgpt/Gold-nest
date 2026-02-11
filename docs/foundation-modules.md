# Foundation Modules (Hardened)

## Contract
- Success envelope: `{ ok:true, result:<payload>, traceId, ts }`
- Error envelope: `{ ok:false, result:null, error:{code,message,details?}, traceId, ts }`
- List contract in `result`: `{ items: T[], meta: { page, limit, totalItems, totalPages, hasNextPage, hasPrevPage } }`

## Effective settings merge
`defaults -> customerGroupSettings -> userSettings`.
Overview endpoints may include sources for each field (`DEFAULT|GROUP|USER`).

## Endpoint catalog (added/updated)
- `GET /me/overview`
- `GET /me/kyc`
- `POST /me/kyc/submit`
- `GET /me/policy/summary`
- `GET /admin/users`
- `GET /admin/users/:id/overview`
- `PATCH /admin/users/:id`
- `GET /admin/users/:id/policy/summary`
- `POST /admin/users/:id/wallet/adjust`
- `GET /accounts/statement` (paged `{items,meta}`)
- `GET /admin/accounts/:userId/statement` (paged `{items,meta}`)
- `DELETE /admin/customer-groups/:id`
- `GET /admin/customer-groups/:id/users`
- `POST /admin/customer-groups/:id/users:move`
- `GET /admin/customer-groups/:id/settings`
- `PUT /admin/customer-groups/:id/settings`
- `GET /admin/policy-rules` (paged `{items,meta}`)
- `GET /admin/tahesab/outbox`
- `POST /admin/tahesab/outbox/:id/retry`
- `POST /admin/users/:id/tahesab/resync`

## DTO/response notes
- Decimal fields are emitted as string in wallet/account statement/policy summary.
- `/me/overview` returns `user`, `kyc`, `settings`, `wallet`, `policy.summary`, `capabilities`.

## Tahesab outbox ops
- Outbox list supports filters by status/method/correlation/time range.
- Retry endpoint resets item to `PENDING` and clears `lastError`.
- User resync enqueues `DoEditMoshtari` for linked users.
