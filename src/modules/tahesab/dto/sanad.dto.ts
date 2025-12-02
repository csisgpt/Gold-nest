export class DoNewSanadGoldRequestDto {
  sanadDateShamsi: string;
  description?: string;
  items: Array<Record<string, unknown>>;
  customerCode?: string;
  sanadNo?: string | number;
}

export class DoNewSanadGoldResponseDto {
  sanadId?: number;
  sanadNo?: string;
  [key: string]: unknown;
}

export class DoDeleteSanadRequestDto {
  sanadNo: string | number;
  reason?: string;
}

export class DoDeleteSanadResponseDto {
  success?: boolean;
  [key: string]: unknown;
}

export class DoNewSanadInquiryRequestDto {
  sanadNo: string | number;
}

export class DoNewSanadInquiryResponseDto {
  exists?: boolean;
  sanad?: Record<string, unknown>;
  [key: string]: unknown;
}
