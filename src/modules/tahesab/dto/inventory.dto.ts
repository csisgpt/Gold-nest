export class GetMojoodiAbshodeRequestDto {
  ayar: number;
  jensFelez: number;
}

export class GetMojoodiAbshodeRow {
  ayar?: number | string;
  vazn?: number | string;
  mandeyeMali?: number | string;
}

export class GetMojoodiAbshodeResponseDto {
  items?: GetMojoodiAbshodeRow[];
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
}

export class DoTarazAbshodeSekehArzResponseDto {
  balances?: DoTarazAbshodeSekehArzRow[];
}
