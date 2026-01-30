# P2P Withdrawal Settlement Flow

## Overview
P2P withdrawals let admin match withdrawal requests against user deposit offers. Allocations reserve the withdrawal funds, send destination details to payers, and settle internally once confirmed.

## High-level Flow
1. **Withdrawal created** with `purpose=P2P` and a payout destination (preferred) or legacy bank fields.
2. **Admin lists P2P withdrawals** and opens a withdrawal to view eligible deposit offers.
3. **Admin assigns offers** to the withdrawal. Each assignment creates a `P2PAllocation` with an expiry.
4. **Payer receives destination snapshot** and submits proof + bank ref.
5. **Receiver confirms** payment (or disputes) and/or **admin verifies**, based on policy.
6. **Admin finalizes** the allocation: reservations are consumed and ledger entries posted.
7. **Expired/Cancelled allocations** merge reservations back to the withdrawal for future assignments.

## Confirmation Policy
Controlled by `P2P_CONFIRMATION_MODE`:
- `RECEIVER`: receiver confirmation only.
- `ADMIN`: admin verification only.
- `BOTH`: both receiver confirmation and admin verification required.

## Endpoints
### Admin
- `GET /admin/p2p/withdrawals`
- `GET /admin/p2p/withdrawals/:id/candidates`
- `POST /admin/p2p/withdrawals/:id/assign`
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

## Status Transitions
### P2PAllocation
- `ASSIGNED` -> `PROOF_SUBMITTED` (payer uploads proof)
- `PROOF_SUBMITTED` -> `RECEIVER_CONFIRMED` (receiver confirms)
- `PROOF_SUBMITTED` -> `ADMIN_VERIFIED` (admin verifies)
- `RECEIVER_CONFIRMED` + `ADMIN_VERIFIED` -> `SETTLED` (finalized)
- Any non-settled -> `DISPUTED` (receiver or admin rejects)
- `ASSIGNED|PROOF_SUBMITTED` -> `EXPIRED` (worker)
- Admin can set `CANCELLED`

## Environment Variables
- `P2P_ALLOCATION_TTL_MINUTES` (default 1440)
- `P2P_CONFIRMATION_MODE` (default RECEIVER)
- `DESTINATION_ENCRYPTION_KEY` (required for secure encryption)
