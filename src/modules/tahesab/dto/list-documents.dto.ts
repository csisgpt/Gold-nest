export class DoListAsnadRequestDto {
  countLast: number;
  customerCode: string;
  fromDateShamsi: string;
  toDateShamsi: string;
  filterNoSanad?: string;
  /** Jens_Felez: 0 = gold, 1 = silver, etc. */
  jensFelez?: number | null;
}

export class TahesabDocumentRow {
  tarikh?: string;
  noSanad?: string;
  sharh?: string;
  bedehkar?: number | string;
  bestankar?: number | string;
  vazn?: number | string;
  ayar?: number | string;
  mablagh?: number | string;
  [key: string]: unknown;
}

export class DoListAsnadResponseDto {
  documents: TahesabDocumentRow[];
}
