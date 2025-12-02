export class GetMandeHesabByGidRequestDto {
  gid: number | string;
}

export class GetMandeHesabByCodeRequestDto {
  customerCode: string;
}

export class GetMandeHesabByDateRequestDto {
  customerCode: string;
  dateShamsi: string;
}

export class GetMandeHesabResponseDto {
  balance?: number | string;
  credit?: number | string;
  debt?: number | string;
  [key: string]: unknown;
}
