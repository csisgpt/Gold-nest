export class DoNewMoshtariRequestDto {
  name: string;
  groupName: string;
  tel: string;
  address: string;
  nationalCode: string;
  birthDateShamsi?: string;
  referrerName?: string;
  referrerCode?: string | number;
  /** Moshtari_Code; -1 usually means auto-code */
  moshtariCode?: string | number;
  /** Jens_Felez: 0 = gold, 1 = silver, etc. */
  jensFelez?: number;
}

export class DoNewMoshtariResponseDto {
  moshtariCode?: string | number;
  gid?: string | number;
}

export class DoEditMoshtariRequestDto {
  moshtariCode: string | number;
  name: string;
  groupName: string;
  tel: string;
  address: string;
  nationalCode: string;
  birthDateShamsi?: string;
  referrerName?: string;
  referrerCode?: string | number;
  description?: string;
}

export class DoEditMoshtariResponseDto {
  moshtariCode?: string | number;
  gid?: string | number;
}

export class DoListMoshtariRequestDto {
  fromCode?: string | number;
  toCode?: string | number;
  mobile?: string;
}

export class TahesabCustomerSummary {
  code?: string | number;
  name?: string;
  groupName?: string;
  tel?: string;
  mobile?: string;
}

export class DoListMoshtariResponseDto {
  customers: TahesabCustomerSummary[];
}

export class GetMoshtariByCodeRequestDto {
  customerCode: string;
}

export class GetMoshtariByCodeResponseDto {
  customer?: Record<string, string | number | boolean | null>;
}
