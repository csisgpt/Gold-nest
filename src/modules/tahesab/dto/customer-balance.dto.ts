export class GetMandeHesabByGidRequestDto {
  /** Tahesab customer GID */
  gid: string | number;
}

export class GetMandeHesabByCodeRequestDto {
  /** One or more Tahesab customer codes */
  customerCodes: Array<string | number>;
}

export class GetMandeHesabByDateRequestDto {
  customerCode: string;
  /** TarikhShamsi */
  dateShamsi: string;
}

export class GetMandeHesabResponseDto {
  mandeyeKolBePool?: number | string;
  mandeyeKolBeTala?: number | string;
  mandeyeMali?: number | string;
  mandeyeVazni?: number | string;
  bedehkar?: number | string;
  bestankar?: number | string;
}
