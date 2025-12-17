import { InstrumentType, RemittanceChannel } from '@prisma/client';
import type {
  DoEditMoshtariRequestDto,
  DoEditMoshtariResponseDto,
  DoListMoshtariResponseDto,
  DoNewMoshtariRequestDto,
  DoNewMoshtariResponseDto,
  GetMoshtariByCodeResponseDto,
} from './dto/moshtari.dto';
import type {
  DoDeleteSanadRequestDto,
  DoDeleteSanadResponseDto,
  DoNewSanadGoldRequestDto,
  DoNewSanadInquiryResponseDto,
} from './dto/sanad.dto';
import type { GoldBuySellDto, SimpleVoucherDto } from './tahesab-documents.service';
import type {
  DoTarazAbshodeSekehArzRow,
  GetMojoodiAbshodeRow,
  GetMojoodiAbshodeResponseDto
} from './dto/inventory.dto';
import type { DoListAsnadResponseDto } from './dto/list-documents.dto';
import type {
  DoListEtiketResponseDto,
  DoListGetUpdatedEtiketResponseDto,
  GetEtiketInfoResponseDto,
  GetEtiketInfoWithImageResponseDto,
  GetEtiketPictureByFileNameResponseDto,
  GetEtiketTableInfoResponseDto,
  SetEtiketRFIDClearResponseDto,
} from './dto/etiket.dto';
import type {
  DoListHesabBankiResponseDto,
  DoListNameKarSakhteResponseDto,
  DoListNameSekehResponseDto,
  GetMojoodiBankResponseDto,
  GetMojoodiKarSakhteResponseDto,
  TahesabBalanceRowDto,
  PingResponseDto,
} from './dto/common.dto';
import type {
  GetMandeHesabResponseDto,
  GetMandeHesabByDateRequestDto,
} from './dto/customer-balance.dto';

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
}

export interface BankBalance {
  Name: string;
  Mande: number;
  GardeshVariz: number;
  GardeshBardasht: number;
}

export interface AbshodeMojoodiRow {
  Ayar: string;
  VaznMojood: number;
}

export type TahesabGenericRecord = Record<string, string | number | boolean | null>;

export type TahesabMethodMap = {
  Ping: { args: []; response: PingResponseDto };

  // Inventory / balances
  GetMojoodiBank: { args: [nameBank: string]; response: BankBalance[] };
  GetMojoodiAbshodeMotefareghe: {
    args: [number, number]; // آرگومان‌های payloadArray
    response: GetMojoodiAbshodeResponseDto; // <-- اصلاح شد
  };
  GetMojoodiKarSakhte: {
    args: [jensFelez: JensFelez];
    response: TahesabBalanceRowDto[];
  };
  DoTarazAbshodeSekehArz: {
    args: [number, JensFelez];
    response: DoTarazAbshodeSekehArzRow[];
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
    response: DoNewMoshtariResponseDto;
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
    response: DoEditMoshtariResponseDto;
  };
  DoListMoshtari: {
    args: [mobile: string] | [fromCode: string | number, toCode: string | number];
    response: DoListMoshtariResponseDto;
  };
  GetMoshtariByCode: { args: [customerCode: string | number]; response: GetMoshtariByCodeResponseDto };
  GetMandeHesabByGID: { args: [gid: string | number]; response: GetMandeHesabResponseDto };
  getmandehesabbycode: { args: [customerCodes: Array<string | number>]; response: GetMandeHesabResponseDto[] };
  GetMandeHesabByTarikh: {
    args: [customerCode: string | number, dateShamsi: string];
    response: GetMandeHesabResponseDto;
  };

  // Name lists
  DoListNameSekeh: { args: []; response: DoListNameSekehResponseDto };
  DoListHesabBanki: { args: []; response: DoListHesabBankiResponseDto };
  DoListNameKarSakhte: { args: []; response: DoListNameKarSakhteResponseDto };
  GetBankMande: {
    args: [bankCode: string];
    response: TahesabBalanceRowDto[];
  };
  GetSandoghMande: {
    args: [cashboxCode: string];
    response: TahesabBalanceRowDto[];
  };
  // Documents creation variations
  DoNewSanadVKHGOLD: {
    args: [
      sabteKolOrMovaghat: number,
      moshtariCode: string | number,
      factorNumber: string | number,
      radifNumber: string | number,
      shamsiYear: string,
      shamsiMonth: string,
      shamsiDay: string,
      vazn: number | string,
      ayar: number | string,
      angNumber: string,
      nameAz: string,
      isVoroodOrKhorooj: number,
      isMotefaregheOrAbshode: number,
      sharh: string,
      factorCode: string,
      havalehBeMcode?: string | number,
      multiRadif?: number,
      jensFelez?: number,
    ];
    response: TahesabDocumentResult;
  };
  DoNewSanadBuySaleGOLD: {
    args: [
      sabteKolOrMovaghat: number,
      moshtariCode: string | number,
      factorNumber: string | number,
      shamsiYear: string,
      shamsiMonth: string,
      shamsiDay: string,
      mablagh: number | string,
      ayar: number | string,
      vazn: number | string,
      angNumber: string,
      nameAz: string,
      buyOrSale: number,
      sharh: string,
      factorCode: string | number,
      jensFelez: JensFelez,
    ];
    response: TahesabDocumentResult;
  };
  DoNewSanadVKHSEKEH: { args: TahesabMethodMap['DoNewSanadBuySaleGOLD']['args']; response: TahesabDocumentResult };
  DoNewSanadBuySaleSEKEH: { args: TahesabMethodMap['DoNewSanadBuySaleGOLD']['args']; response: TahesabDocumentResult };
  DoNewSanadVKHVaghNaghd: {
    args: [
      sabteKolOrMovaghat: number,
      moshtariCode: string | number,
      factorNumber: string | number,
      shamsiYear: string,
      shamsiMonth: string,
      shamsiDay: string,
      mablagh: number | string,
      sharh: string,
      factorCode: string | number,
    ];
    response: TahesabDocumentResult;
  };
  DoNewSanadVKHBank: { args: TahesabMethodMap['DoNewSanadVKHVaghNaghd']['args']; response: TahesabDocumentResult };
  DoNewSanadTakhfif: { args: TahesabMethodMap['DoNewSanadVKHVaghNaghd']['args']; response: TahesabDocumentResult };
  DoNewSanadTalabBedehi: { args: TahesabMethodMap['DoNewSanadVKHVaghNaghd']['args']; response: TahesabDocumentResult };
  DoNewSanadBuySaleKar: { args: TahesabMethodMap['DoNewSanadBuySaleGOLD']['args']; response: TahesabDocumentResult };
  DoNewSanadVKHKar: { args: TahesabMethodMap['DoNewSanadBuySaleGOLD']['args']; response: TahesabDocumentResult };
  DoNewSanadBuySaleEtiket: { args: TahesabMethodMap['DoNewSanadBuySaleGOLD']['args']; response: TahesabDocumentResult };
  DoNewSanadVKHEtiket: { args: TahesabMethodMap['DoNewSanadBuySaleGOLD']['args']; response: TahesabDocumentResult };

  // Etiket info & lists
  GetEtiketPictureByFileName: { args: [fileName: string]; response: GetEtiketPictureByFileNameResponseDto };
  getetiketinfobycode: { args: [(string | number)[]]; response: GetEtiketInfoResponseDto };
  getetiketinfobycodewithimage: { args: [(string | number)[]]; response: GetEtiketInfoWithImageResponseDto };
  DoListEtiket: {
    args: [fromCode: string | number, toCode: string | number, withPhoto: number];
    response: DoListEtiketResponseDto;
  };
  DoListGetUpdatedEtiket: { args: [fromDate: string, toDate: string]; response: DoListGetUpdatedEtiketResponseDto };
  DoList_EtiketByCodeKar: { args: [codeKar: string]; response: DoListEtiketResponseDto };
  GetEtiketTableInfo: { args: []; response: GetEtiketTableInfoResponseDto };
  SetEtiketRFIDClear: { args: [code: string | number]; response: SetEtiketRFIDClearResponseDto };

  // Documents listing & queries
  DoListAsnad: {
    args: [
      countLast: number,
      customerCode: string,
      fromDateShamsi: string,
      toDateShamsi: string,
      filterNoSanad: string,
      jensFelez: number | null,
    ];
    response: DoListAsnadResponseDto;
  };
  DoNewSanadInquiry: {
    args: [
      moshtariCode: string | number,
      factorNumber: string | number,
      shamsiYear: string,
      shamsiMonth: string,
      shamsiDay: string,
    ];
    response: DoNewSanadInquiryResponseDto;
  };
  DoDeleteSanad: { args: [factorCode: string]; response: DoDeleteSanadResponseDto };

  // RFID
  GetInfoWithImage: { args: [epcs: string[]]; response: GetEtiketInfoWithImageResponseDto };
  GetInfo: { args: [epcs: string[]]; response: GetEtiketInfoResponseDto };
  epcList: { args: [epcs: string[]]; response: TahesabGenericRecord[] };
};

export type TahesabOutboxAction =
  | 'DoNewMoshtari'
  | 'DoEditMoshtari'
  | 'DoNewSanadVKHGOLD'
  | 'DoNewSanadBuySaleGOLD'
  | 'DoNewSanadVKHVaghNaghd'
  | 'DoNewSanadVKHBank'
  | 'DoNewSanadTakhfif'
  | 'DoNewSanadTalabBedehi'
  | 'DoDeleteSanad'
  | 'RemittanceVoucher';

export interface RemittanceOutboxPayload {
  legId: string;
  fromCustomerCode: string;
  toCustomerCode: string;
  instrumentCode: string;
  instrumentType: InstrumentType;
  channel: RemittanceChannel;
  amount: string;
  accountCode: string;
  shamsiYear: string;
  shamsiMonth: string;
  shamsiDay: string;
  description: string;
  settlements?: { sourceRemittanceId: string; amount: string }[];
}

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
  DoDeleteSanad: DoDeleteSanadRequestDto;
  RemittanceVoucher: RemittanceOutboxPayload;
}
