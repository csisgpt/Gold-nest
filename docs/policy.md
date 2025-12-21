# Policy, Limits, and Reservations

## Lifecycle
- **reserve**: check policy limits for the user + instrument selector and increment the reserved amount.
- **consume**: convert an existing reservation to used amount.
- **release**: free a reservation without consuming limit.

## Rule precedence
1. Scope: `USER` > `GROUP` > `GLOBAL`
2. Selector: `instrumentId` > `instrumentType` > `ALL`
3. Priority: lower `priority` number wins ties

## Instrument keys
Limit usages and reservations use `instrumentKey` values of `"ALL"` for generic rules or the specific instrument id when reserved per instrument.

## Trades
- BUY trades use `PolicyAction.TRADE_BUY`; SELL trades use `PolicyAction.TRADE_SELL`.
- All trades reserve `PolicyMetric.NOTIONAL_IRR` against `instrumentKey="ALL"` for both daily and monthly windows.
- Gold instruments reserve `PolicyMetric.WEIGHT_750_G` per instrument id; coin instruments reserve `PolicyMetric.COUNT` per instrument id.
- Reservations are taken when the trade is created, consumed on approval/settlement, and released on cancel/reject.
