export class DoListEtiketRequestDto {
  fromCode?: string | number;
  toCode?: string | number;
  withPhoto?: boolean;
}

export class DoListEtiketResponseDto {
  etikets?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export class DoListGetUpdatedEtiketRequestDto {
  fromDateTime: string;
  toDateTime: string;
}

export class DoListGetUpdatedEtiketResponseDto {
  etikets?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export class GetEtiketTableInfoResponseDto {
  columns?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export class GetInfoRequestDto {
  epcList: string[];
}

export class GetInfoResponseDto {
  item?: Record<string, unknown>;
  [key: string]: unknown;
}

export class GetInfoWithImageRequestDto {
  epcList: string[];
}

export class GetInfoWithImageResponseDto {
  item?: Record<string, unknown>;
  [key: string]: unknown;
}

export class GetEtiketInfoByCodeRequestDto {
  codes: (string | number)[];
}

export class SetEtiketRFIDClearRequestDto {
  code: string | number;
}

export class SetEtiketRFIDClearResponseDto {
  success?: boolean;
  [key: string]: unknown;
}
