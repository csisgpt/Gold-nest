# API Contract (Epic 0 / Sprint 1)

This document defines the uniform JSON contract for API responses.

## Success envelope (JSON only)
```json
{
  "ok": true,
  "result": { "any": "payload" },
  "traceId": "req_1234567890",
  "ts": "2024-01-01T00:00:00.000Z"
}
```

## Error envelope (all errors)
```json
{
  "ok": false,
  "result": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "path": "accounts[0].accountNumber", "message": "must be a number" }
    ]
  },
  "traceId": "req_1234567890",
  "ts": "2024-01-01T00:00:00.000Z"
}
```

## Validation details
- `details` is an array of `{ path, message }`.
- `path` follows nested objects and arrays (e.g., `profile.address.city`, `accounts[0].accountNumber`).

## List contract
```json
{
  "items": [ { "id": "..." } ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 100,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

## Deprecated `offset` query parameter
- `offset` is still accepted for list endpoints.
- If `page` is missing and `offset` is provided, the server maps it to the correct `page`.
- If both `page` and `offset` are provided, `page` wins.
- When `offset` is used, the response includes header `X-Deprecated: offset`.

## Manual smoke checks
```bash
# JSON success envelope
curl -i http://localhost:3000/

# Validation error envelope (admin endpoint; requires a valid token)
curl -i -X POST http://localhost:3000/admin/product-provider-mappings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{}'

# P2P list (page/limit/sort)
curl -i "http://localhost:3000/admin/p2p/withdrawals?page=1&limit=20&sort=-createdAt" \
  -H "Authorization: Bearer <token>"

# P2P list (offset deprecated)
curl -i "http://localhost:3000/admin/p2p/withdrawals?offset=40&limit=20" \
  -H "Authorization: Bearer <token>"

# File/SSE endpoints should return raw stream without envelope
# Example: curl -i "http://localhost:3000/files/<id>/raw?disposition=inline"
```
