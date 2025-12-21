import { InstrumentType } from '@prisma/client';

export interface SelectorInput {
  productId?: string | null;
  instrumentId?: string | null;
  instrumentType?: InstrumentType | null;
}

export function normalizeSelector(input: SelectorInput) {
  if (input.productId) {
    return { productId: input.productId, instrumentId: null, instrumentType: null };
  }
  if (input.instrumentId) {
    return { productId: null, instrumentId: input.instrumentId, instrumentType: null };
  }
  if (input.instrumentType) {
    return { productId: null, instrumentId: null, instrumentType: input.instrumentType };
  }
  return { productId: null, instrumentId: null, instrumentType: null };
}
