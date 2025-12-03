export class PingResponseDto {
  status?: string;
  message?: string;
  version?: string;
  [key: string]: unknown;
}

export class TahesabNamedItemDto {
  code?: string | number;
  name?: string;
  [key: string]: unknown;
}

export class TahesabBalanceRowDto {
  mande?: number | string;
  bedehkar?: number | string;
  bestankar?: number | string;
  [key: string]: unknown;
}

export class GetBankBalanceRequestDto {
  bankCode: string;
}

export class GetBankBalanceResponseDto {
  balances?: TahesabBalanceRowDto[];
  [key: string]: unknown;
}

export class GetCashboxBalanceRequestDto {
  cashboxCode: string;
}

export class GetCashboxBalanceResponseDto {
  balances?: TahesabBalanceRowDto[];
  [key: string]: unknown;
}

export class DoListNameSekehResponseDto {
  items?: TahesabNamedItemDto[];
  [key: string]: unknown;
}

export class DoListHesabBankiResponseDto {
  accounts?: TahesabNamedItemDto[];
  [key: string]: unknown;
}

export class DoListNameKarSakhteResponseDto {
  items?: TahesabNamedItemDto[];
  [key: string]: unknown;
}

export class GetMojoodiBankRequestDto {
  bankCode: string | number;
}

export class GetMojoodiBankResponseDto {
  balances?: TahesabBalanceRowDto[];
  [key: string]: unknown;
}

export class GetMojoodiKarSakhteRequestDto {
  jensFelez: number;
}

export class GetMojoodiKarSakhteResponseDto {
  balances?: TahesabBalanceRowDto[];
  [key: string]: unknown;
}
