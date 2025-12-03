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

export type TahesabMethodMap = {
  Ping: { args: []; response: any };

  // Inventory / balances
  GetMojoodiBank: { args: [nameBank: string]; response: BankBalance[] };
  GetMojoodiAbshodeMotefareghe: {
    args: [ayar: number | string, jensFelez: JensFelez];
    response: AbshodeMojoodiRow[];
  };
  GetMojoodiKarSakhte: { args: [jensFelez: JensFelez]; response: any };
  DoTarazAbshodeSekehArz: {
    args: [baEhtesabSekeh: number, jensFelez: JensFelez];
    response: any;
  };

  // Customer / account
  DoNewMoshtari: { args: any[]; response: any };
  DoEditMoshtari: { args: any[]; response: any };
  DoListMoshtari: { args: any[]; response: any };
  GetMoshtariByCode: { args: [customerCode: string | number]; response: any };
  GetMandeHesabByGID: { args: [gid: string | number]; response: any };
  getmandehesabbycode: { args: [customerCodes: Array<string | number>]; response: any };
  GetMandeHesabByTarikh: {
    args: [customerCode: string | number, dateShamsi: string];
    response: any;
  };

  // Name lists
  DoListNameSekeh: { args: []; response: any };
  DoListHesabBanki: { args: []; response: any };
  DoListNameKarSakhte: { args: []; response: any };
  GetBankMande: { args: [bankCode: string]; response: any };
  GetSandoghMande: { args: [cashboxCode: string]; response: any };

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
  GetEtiketPictureByFileName: { args: [fileName: string]; response: any };
  getetiketinfobycode: { args: [(string | number)[]]; response: any };
  getetiketinfobycodewithimage: { args: [(string | number)[]]; response: any };
  DoListEtiket: {
    args: [fromCode: string | number, toCode: string | number, withPhoto: number];
    response: any;
  };
  DoListGetUpdatedEtiket: { args: [fromDate: string, toDate: string]; response: any };
  DoList_EtiketByCodeKar: { args: [codeKar: string]; response: any };
  GetEtiketTableInfo: { args: []; response: any };
  SetEtiketRFIDClear: { args: [code: string | number]; response: any };

  // Documents listing & queries
  DoListAsnad: { args: any[]; response: any };
  DoNewSanadInquiry: { args: any[]; response: any };
  DoDeleteSanad: { args: [factorCode: string]; response: any };

  // RFID
  GetInfoWithImage: { args: [epcs: string[]]; response: any };
  GetInfo: { args: [epcs: string[]]; response: any };
  epcList: { args: [epcs: string[]]; response: any };
};
