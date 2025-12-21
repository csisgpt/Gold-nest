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
