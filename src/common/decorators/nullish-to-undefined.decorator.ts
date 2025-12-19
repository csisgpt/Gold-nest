import { Transform } from 'class-transformer';

const NULLISH_VALUES = [undefined, null, '', 'null', 'undefined'];

export function NullishToUndefined(): PropertyDecorator {
  return Transform(({ value }) => (NULLISH_VALUES.includes(value as never) ? undefined : value));
}
