export class DoListEtiketRequestDto {
  fromCode?: string | number;
  toCode?: string | number;
  withPhoto?: boolean;
}

export class DoListEtiketResponseDto {
  etikets?: Array<Record<string, string | number | boolean | null>>;
}

export class DoListGetUpdatedEtiketRequestDto {
  fromDateTime: string;
  toDateTime: string;
}

export class DoListGetUpdatedEtiketResponseDto {
  etikets?: Array<Record<string, string | number | boolean | null>>;
}

export class GetEtiketTableInfoResponseDto {
  columns?: Array<Record<string, string | number | boolean | null>>;
}

export class GetInfoRequestDto {
  epcList: string[];
}

export class GetInfoResponseDto {
  item?: Record<string, string | number | boolean | null>;
}

export class GetInfoWithImageRequestDto {
  epcList: string[];
}

export class GetInfoWithImageResponseDto {
  item?: Record<string, string | number | boolean | null>;
}

export class GetEtiketInfoByCodeRequestDto {
  codes: (string | number)[];
}

export class SetEtiketRFIDClearRequestDto {
  code: string | number;
}

export class SetEtiketRFIDClearResponseDto {
  success?: boolean;
}

export class GetEtiketInfoResponseDto {
  item?: Record<string, string | number | boolean | null>;
}

// 2) GetEtiketInfoWithImageResponseDto
export class GetEtiketInfoWithImageResponseDto {
  item?: Record<string, string | number | boolean | null>;
  imageBase64?: string; // Tahesab returns base64 for images
}

// 3) GetEtiketPictureByFileNameResponseDto
export class GetEtiketPictureByFileNameResponseDto {
  fileName: string;
  imageBase64?: string;
}
