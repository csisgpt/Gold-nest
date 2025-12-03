import type { DoEditMoshtariRequestDto, DoNewMoshtariRequestDto } from './dto/moshtari.dto';
import type { DoNewSanadGoldRequestDto } from './dto/sanad.dto';
import type { GoldBuySellDto, SimpleVoucherDto } from './tahesab-documents.service';

export enum SabteKolOrMovaghat {
  Movaghat = 0,
  Kol = 1,
}

export enum VoroodOrKhorooj {
  Vorood = 0,
  Khorooj = 1,
}

export enum BuyOrSale {
  Sell = 0,
  Buy = 1,
}

export enum MazanehUnit {
  Mesghal = 0,
  Geram = 1,
}

// NOTE: in the Tahesab docs, "Jens_Felez" sometimes uses:
// 0: all, 1: gold, 2: platinum, 3: silver.
export enum JensFelez {
  All = 0,
  Gold = 1,
  Platinum = 2,
  Silver = 3,
}

export interface TahesabDocumentResult {
  OK: string;
  Sh_factor?: string;
  [key: string]: any;
}

export interface BankBalance {
  Name: string;
  Mande: number;
  GardeshVariz: number;
  GardeshBardasht: number;
  [key: string]: any;
}

export interface AbshodeMojoodiRow {
  Ayar: string;
  VaznMojood: number;
  [key: string]: any;
}

export interface TahesabListResponse<T = Record<string, any>> {
  list: T[];
  [key: string]: any;
}

/** Currently unused, reserved for future use. */
export interface TahesabUnknownResponse {
  [key: string]: any;
}

export type TahesabMethodMap = {
  Ping: { args: []; response: any };

  // Inventory / balances
  GetMojoodiBank: { args: [nameBank: string]; response: BankBalance[] };
  GetMojoodiAbshodeMotefareghe: {
    args: [ayar: number | string, jensFelez: JensFelez];
    response: AbshodeMojoodiRow[];
  };
  GetMojoodiKarSakhte: { args: [jensFelez: JensFelez]; response: TahesabUnknownResponse };
  DoTarazAbshodeSekehArz: {
    args: [baEhtesabSekeh: number, jensFelez: JensFelez];
    response: TahesabUnknownResponse;
  };

  // Customer / account
  DoNewMoshtari: {
    args: [
      name: string,
      groupName: string,
      tel: string,
      address: string,
      nationalCode: string,
      birthDateShamsi: string,
      referrerName: string,
      referrerCode: string | number,
      moshtariCode: string | number,
      jensFelez: number,
    ];
    response: any;
  };
  DoEditMoshtari: {
    args: [
      moshtariCode: string | number,
      name: string,
      groupName: string,
      tel: string,
      address: string,
      nationalCode: string,
      birthDateShamsi: string,
      referrerName: string,
      referrerCode: string | number,
      description: string,
    ];
    response: any;
  };
  DoListMoshtari: {
    args: [mobile: string] | [fromCode: string | number, toCode: string | number];
    response: any;
  };
  GetMoshtariByCode: { args: [customerCode: string | number]; response: any };
  GetMandeHesabByGID: { args: [gid: string | number]; response: any };
  getmandehesabbycode: { args: [customerCodes: Array<string | number>]; response: any };
  GetMandeHesabByTarikh: {
    args: [customerCode: string | number, dateShamsi: string];
    response: any;
  };

  // Name lists
  DoListNameSekeh: { args: []; response: TahesabListResponse };
  DoListHesabBanki: { args: []; response: TahesabListResponse };
  DoListNameKarSakhte: { args: []; response: TahesabListResponse };
  GetBankMande: { args: [bankCode: string]; response: TahesabUnknownResponse };
  GetSandoghMande: { args: [cashboxCode: string]; response: TahesabUnknownResponse };

  // Documents creation variations
  DoNewSanadVKHGOLD: { args: any[]; response: TahesabDocumentResult };
  DoNewSanadBuySaleGOLD: { args: any[]; response: TahesabDocumentResult };
  DoNewSanadVKHSEKEH: { args: any[]; response: TahesabDocumentResult };
  DoNewSanadBuySaleSEKEH: { args: any[]; response: TahesabDocumentResult };
  DoNewSanadVKHVaghNaghd: { args: any[]; response: TahesabDocumentResult };
  DoNewSanadVKHBank: { args: any[]; response: TahesabDocumentResult };
  DoNewSanadTakhfif: { args: any[]; response: TahesabDocumentResult };
  DoNewSanadTalabBedehi: { args: any[]; response: TahesabDocumentResult };
  DoNewSanadBuySaleKar: { args: any[]; response: TahesabDocumentResult };
  DoNewSanadVKHKar: { args: any[]; response: TahesabDocumentResult };
  DoNewSanadBuySaleEtiket: { args: any[]; response: TahesabDocumentResult };
  DoNewSanadVKHEtiket: { args: any[]; response: TahesabDocumentResult };

  // Etiket info & lists
  GetEtiketPictureByFileName: { args: [fileName: string]; response: TahesabUnknownResponse };
  getetiketinfobycode: { args: [(string | number)[]]; response: TahesabUnknownResponse };
  getetiketinfobycodewithimage: { args: [(string | number)[]]; response: TahesabUnknownResponse };
  DoListEtiket: {
    args: [fromCode: string | number, toCode: string | number, withPhoto: number];
    response: TahesabUnknownResponse;
  };
  DoListGetUpdatedEtiket: { args: [fromDate: string, toDate: string]; response: TahesabUnknownResponse };
  DoList_EtiketByCodeKar: { args: [codeKar: string]; response: TahesabUnknownResponse };
  GetEtiketTableInfo: { args: []; response: TahesabUnknownResponse };
  SetEtiketRFIDClear: { args: [code: string | number]; response: TahesabUnknownResponse };

  // Documents listing & queries
  DoListAsnad: { args: any[]; response: TahesabUnknownResponse };
  DoNewSanadInquiry: { args: any[]; response: TahesabUnknownResponse };
  DoDeleteSanad: { args: [factorCode: string]; response: TahesabUnknownResponse };

  // RFID
  GetInfoWithImage: { args: [epcs: string[]]; response: any };
  GetInfo: { args: [epcs: string[]]; response: any };
  epcList: { args: [epcs: string[]]; response: any };
};

export type TahesabOutboxAction =
  | 'DoNewMoshtari'
  | 'DoEditMoshtari'
  | 'DoNewSanadVKHGOLD'
  | 'DoNewSanadBuySaleGOLD'
  | 'DoNewSanadVKHVaghNaghd'
  | 'DoNewSanadVKHBank'
  | 'DoNewSanadTakhfif'
  | 'DoNewSanadTalabBedehi';

// Outbox uses DTO payloads instead of raw positional arrays
export interface TahesabOutboxPayloadMap {
  DoNewMoshtari: DoNewMoshtariRequestDto;
  DoEditMoshtari: DoEditMoshtariRequestDto;
  DoNewSanadVKHGOLD: DoNewSanadGoldRequestDto;
  DoNewSanadBuySaleGOLD: GoldBuySellDto;
  DoNewSanadVKHVaghNaghd: SimpleVoucherDto;
  DoNewSanadVKHBank: SimpleVoucherDto;
  DoNewSanadTakhfif: SimpleVoucherDto;
  DoNewSanadTalabBedehi: SimpleVoucherDto;
}
