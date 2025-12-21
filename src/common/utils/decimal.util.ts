import { Decimal } from '@prisma/client/runtime/library';

export type Decimalish = Decimal.Value | null | undefined;

export function dec(value: Decimalish): Decimal {
  return new Decimal(value ?? 0);
}

export function minDec(a: Decimalish, b: Decimalish): Decimal {
  const da = dec(a);
  const db = dec(b);
  return da.lte(db) ? da : db;
}

export function addDec(a: Decimalish, b: Decimalish): Decimal {
  return dec(a).add(dec(b));
}

export function subDec(a: Decimalish, b: Decimalish): Decimal {
  return dec(a).minus(dec(b));
}

export function isLte(a: Decimalish, b: Decimalish): boolean {
  return dec(a).lte(dec(b));
}

export function isLt(a: Decimalish, b: Decimalish): boolean {
  return dec(a).lt(dec(b));
}

export function isGte(a: Decimalish, b: Decimalish): boolean {
  return dec(a).gte(dec(b));
}

export function isGt(a: Decimalish, b: Decimalish): boolean {
  return dec(a).gt(dec(b));
}
