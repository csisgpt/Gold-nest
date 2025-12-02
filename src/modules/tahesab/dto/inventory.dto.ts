export class GetMojoodiAbshodeRequestDto {
  includeDetails?: boolean;
  metalType?: string | null;
}

export class GetMojoodiAbshodeResponseDto {
  items?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export class DoTarazAbshodeSekehArzRequestDto {
  fromDateShamsi: string;
  toDateShamsi: string;
  metalType?: string | null;
}

export class DoTarazAbshodeSekehArzResponseDto {
  balances?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
