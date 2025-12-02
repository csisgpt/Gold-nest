export class PingResponseDto {
  status?: string;
  message?: string;
  version?: string;
  [key: string]: unknown;
}

export class GetBankBalanceRequestDto {
  bankCode?: string;
  fromDateShamsi?: string;
  toDateShamsi?: string;
}

export class GetBankBalanceResponseDto {
  balances?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export class GetCashboxBalanceRequestDto {
  cashboxCode?: string;
}

export class GetCashboxBalanceResponseDto {
  balances?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
