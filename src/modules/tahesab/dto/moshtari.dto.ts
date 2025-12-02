export class DoNewMoshtariRequestDto {
  name: string;
  code?: string;
  mobile?: string;
  phone?: string;
  address?: string;
  nationalCode?: string;
  city?: string;
  postalCode?: string;
  description?: string;
}

export class DoNewMoshtariResponseDto {
  customerId?: number;
  code?: string;
  [key: string]: unknown;
}

export class DoEditMoshtariRequestDto {
  customerId?: number;
  code?: string;
  name?: string;
  mobile?: string;
  phone?: string;
  address?: string;
  description?: string;
}

export class DoEditMoshtariResponseDto {
  success?: boolean;
  [key: string]: unknown;
}

export class DoListMoshtariRequestDto {
  countLast?: number;
  customerCode?: string;
  fromDateShamsi?: string;
  toDateShamsi?: string;
  searchTerm?: string;
}

export class DoListMoshtariResponseDto {
  customers?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export class GetMoshtariByCodeRequestDto {
  customerCode: string;
}

export class GetMoshtariByCodeResponseDto {
  customer?: Record<string, unknown>;
  [key: string]: unknown;
}
