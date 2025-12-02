export class DoListEtiketRequestDto {
  countLast?: number;
  updatedAfter?: string;
  includeImages?: boolean;
}

export class DoListEtiketResponseDto {
  etikets?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export class DoListGetUpdatedEtiketRequestDto {
  lastSyncDateTime?: string;
}

export class DoListGetUpdatedEtiketResponseDto {
  etikets?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export class GetEtiketTableInfoRequestDto {
  tableName?: string;
}

export class GetEtiketTableInfoResponseDto {
  columns?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export class GetInfoRequestDto {
  barcode: string;
}

export class GetInfoResponseDto {
  item?: Record<string, unknown>;
  [key: string]: unknown;
}

export class GetInfoWithImageRequestDto {
  barcode: string;
}

export class GetInfoWithImageResponseDto {
  item?: Record<string, unknown>;
  [key: string]: unknown;
}

export class SetEtiketRFIDClearRequestDto {
  barcode: string;
  rfid?: string;
}

export class SetEtiketRFIDClearResponseDto {
  success?: boolean;
  [key: string]: unknown;
}
