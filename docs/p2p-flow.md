# P2P Withdrawal Settlement Flow

## Overview
P2P withdrawals let admin match withdrawal requests against user deposit offers. Allocations reserve the withdrawal funds, send destination details to payers, and settle internally once confirmed.

## High-level Flow
1. **Withdrawal created** with `purpose=P2P` and a payout destination (required).
2. **Admin lists P2P withdrawals** and opens a withdrawal to view eligible deposit offers.
3. **Admin assigns offers** to the withdrawal. Each assignment creates a `P2PAllocation` with an expiry.
4. **Payer receives destination snapshot** and submits proof + bank ref + payment method.
5. **Receiver confirms** payment (or disputes) and/or **admin verifies**, based on policy.
6. **Admin finalizes** the allocation: reservations are consumed and ledger entries posted.
7. **Expired/Cancelled allocations** merge reservations back to the withdrawal for future assignments.

## Confirmation Policy
Controlled by `P2P_CONFIRMATION_MODE`:
- `RECEIVER`: receiver confirmation only.
- `ADMIN`: admin verification only.
- `BOTH`: both receiver confirmation and admin verification required.

## Statuses
### Withdraw (P2P)
- CREATED, VALIDATED, WAITING_ASSIGNMENT, PARTIALLY_ASSIGNED, FULLY_ASSIGNED, PARTIALLY_SETTLED, SETTLED, CANCELLED, EXPIRED

### Deposit (P2P)
- CREATED, WAITING_ASSIGNMENT, PARTIALLY_ASSIGNED, FULLY_ASSIGNED, PARTIALLY_SETTLED, SETTLED, CANCELLED, EXPIRED

### Allocation
- ASSIGNED, PROOF_SUBMITTED, RECEIVER_CONFIRMED, ADMIN_VERIFIED, SETTLED, DISPUTED, CANCELLED, EXPIRED

## Channels & Payment Method
- Withdrawal channel: `USER_TO_USER` (default for P2P) or `USER_TO_ORG`.
- Allocation payment method: `CARD_TO_CARD`, `SATNA`, `PAYA`, `TRANSFER`, `UNKNOWN`.

## Attachments
Proofs are stored as attachment links (`AttachmentLink`) with metadata only. APIs return file metadata (id, name, mime, size) and never expose raw storage URLs. Payer uploads proof file IDs to attach them to the allocation. File preview/download is authorized for:
- Admins
- Payer (deposit owner)
- Receiver (withdrawal owner)
Other users cannot access proof files; the UI must call Files API for preview/download.

Destination values are masked in admin/receiver lists. Full destination values are only returned to the payer for allocations assigned to them.

## Endpoints
### Admin
- `GET /admin/p2p/withdrawals`
- `GET /admin/p2p/withdrawals/:id/candidates`
- `POST /admin/p2p/withdrawals/:id/assign`
- `GET /admin/p2p/allocations`
- `GET /admin/p2p/ops-summary`
- `POST /admin/p2p/allocations/:id/verify`
- `POST /admin/p2p/allocations/:id/finalize`
- `POST /admin/p2p/allocations/:id/cancel`

### Payer (Deposit owner)
- `GET /p2p/allocations/my-as-payer`
- `POST /p2p/allocations/:id/proof`

### Receiver (Withdrawal owner)
- `GET /p2p/allocations/my-as-receiver`
- `POST /p2p/allocations/:id/receiver-confirm`

### Payment Destinations
- `GET /me/payout-destinations`
- `POST /me/payout-destinations`
- `PATCH /me/payout-destinations/:id`
- `POST /me/payout-destinations/:id/make-default`
- `GET /admin/destinations?direction=COLLECTION`
- `POST /admin/destinations/system`

## List Filters & Sorts
### Admin Withdrawals
Filters: status, userId, mobile, amountMin/max, remainingToAssignMin/Max, createdFrom/To, destinationBank, destinationType, hasDispute, hasProof, expiringSoonMinutes.
Sort: priority (default), createdAt_desc/asc, amount_desc/asc, remainingToAssign_desc/asc, nearestExpire_asc.

### Admin Candidates (Deposits)
Filters: status, userId, mobile, remainingMin, createdFrom/To, excludeUserId.
Sort: remaining_desc, createdAt_asc/desc.

### Admin Allocations
Filters: status, withdrawalId, depositId, payerUserId, receiverUserId, method, hasProof (proof attachments), bankRef, receiverConfirmed, adminVerified, expired, expiresSoonMinutes, createdFrom/To, paidFrom/To.
Sort: createdAt_desc, expiresAt_asc, paidAt_desc, amount_desc.

### Payer Allocations
Filters: status (default ASSIGNED,PROOF_SUBMITTED), expiresSoon.
Sort: expiresAt_asc, createdAt_desc.

### Receiver Allocations
Filters: status (default PROOF_SUBMITTED), expiresSoon.
Sort: paidAt_desc (fallback updatedAt_desc).

## Environment Variables
- `P2P_ALLOCATION_TTL_MINUTES` (default 1440)
- `P2P_CONFIRMATION_MODE` (default RECEIVER)
- `DESTINATION_ENCRYPTION_KEY` (required for secure encryption)

## Ops Dashboard Tips
- Use `GET /admin/p2p/ops-summary` for fast counts.
- Recommended tabs: waiting assignment, expiring soon, proof submitted, disputes, finalizable.
