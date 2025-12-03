export class PingResponseDto {
  status?: string;
  message?: string;
  version?: string;
}

export class TahesabNamedItemDto {
  code?: string | number;
  name?: string;
}

export class TahesabBalanceRowDto {
  mande?: number | string;
  bedehkar?: number | string;
  bestankar?: number | string;
}

export class GetBankBalanceRequestDto {
  bankCode: string;
}

export class GetBankBalanceResponseDto {
  balances?: TahesabBalanceRowDto[];
}

export class GetCashboxBalanceRequestDto {
  cashboxCode: string;
}

export class GetCashboxBalanceResponseDto {
  balances?: TahesabBalanceRowDto[];
}

export class DoListNameSekehResponseDto {
  items?: TahesabNamedItemDto[];
}

export class DoListHesabBankiResponseDto {
  accounts?: TahesabNamedItemDto[];
}

export class DoListNameKarSakhteResponseDto {
  items?: TahesabNamedItemDto[];
}

export class GetMojoodiBankRequestDto {
  bankCode: string | number;
}

export class GetMojoodiBankResponseDto {
  balances?: TahesabBalanceRowDto[];
}

export class GetMojoodiKarSakhteRequestDto {
  jensFelez: number;
}

export class GetMojoodiKarSakhteResponseDto {
  balances?: TahesabBalanceRowDto[];
}
