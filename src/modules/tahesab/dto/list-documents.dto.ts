export class DoListAsnadRequestDto {
  countLast: number;
  customerCode: string;
  fromDateShamsi: string;
  toDateShamsi: string;
  filterNoSanad?: string | null;
  metalType?: string | null;
}

export class DoListAsnadResponseDto {
  documents?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
