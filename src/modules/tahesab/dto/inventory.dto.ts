export class GetMojoodiAbshodeRequestDto {
  ayar: number;
  jensFelez: number;
}

export class GetMojoodiAbshodeRow {
  ayar?: number | string;
  vazn?: number | string;
  mandeyeMali?: number | string;
  [key: string]: unknown;
}

export class GetMojoodiAbshodeResponseDto {
  items?: GetMojoodiAbshodeRow[];
  [key: string]: unknown;
}

export class DoTarazAbshodeSekehArzRequestDto {
  includeCoin: boolean;
  jensFelez: number;
}

export class DoTarazAbshodeSekehArzRow {
  ayar?: number | string;
  vazn?: number | string;
  bedehkar?: number | string;
  bestankar?: number | string;
  [key: string]: unknown;
}

export class DoTarazAbshodeSekehArzResponseDto {
  balances?: DoTarazAbshodeSekehArzRow[];
  [key: string]: unknown;
}
