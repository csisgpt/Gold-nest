import { Injectable, Logger } from '@nestjs/common';
import { TahesabHttpClient } from './tahesab-http.client';
import type { BankBalance, TahesabDocumentResult, TahesabMethodMap } from './tahesab.methods';
import {
  DoDeleteSanadRequestDto,
  DoDeleteSanadResponseDto,
  DoNewSanadGoldRequestDto,
  DoNewSanadGoldResponseDto,
  DoNewSanadInquiryRequestDto,
  DoNewSanadInquiryResponseDto,
} from './dto/sanad.dto';
import {
  DoNewMoshtariRequestDto,
  DoNewMoshtariResponseDto,
  DoEditMoshtariRequestDto,
  DoEditMoshtariResponseDto,
  DoListMoshtariRequestDto,
  DoListMoshtariResponseDto,
  GetMoshtariByCodeRequestDto,
  GetMoshtariByCodeResponseDto,
} from './dto/moshtari.dto';
import {
  DoListAsnadRequestDto,
  DoListAsnadResponseDto,
} from './dto/list-documents.dto';
import {
  GetMandeHesabByCodeRequestDto,
  GetMandeHesabByDateRequestDto,
  GetMandeHesabByGidRequestDto,
  GetMandeHesabResponseDto,
} from './dto/customer-balance.dto';
import {
  DoListEtiketRequestDto,
  DoListEtiketResponseDto,
  DoListGetUpdatedEtiketRequestDto,
  DoListGetUpdatedEtiketResponseDto,
  GetEtiketInfoByCodeRequestDto,
  GetEtiketTableInfoResponseDto,
  GetInfoRequestDto,
  GetInfoResponseDto,
  GetInfoWithImageRequestDto,
  GetInfoWithImageResponseDto,
  SetEtiketRFIDClearRequestDto,
  SetEtiketRFIDClearResponseDto,
} from './dto/etiket.dto';
import {
  DoTarazAbshodeSekehArzRequestDto,
  DoTarazAbshodeSekehArzResponseDto,
  GetMojoodiAbshodeRequestDto,

  GetMojoodiAbshodeResponseDto,
} from './dto/inventory.dto';
import {
  DoListHesabBankiResponseDto,
  DoListNameKarSakhteResponseDto,
  DoListNameSekehResponseDto,
  GetBankBalanceRequestDto,
  GetBankBalanceResponseDto,
  GetCashboxBalanceRequestDto,
  GetCashboxBalanceResponseDto,
  GetMojoodiBankRequestDto,
  GetMojoodiBankResponseDto,
  GetMojoodiKarSakhteRequestDto,
  GetMojoodiKarSakhteResponseDto,
  PingResponseDto,
  TahesabBalanceRowDto,
} from './dto/common.dto';

/** Facade for internal Tahesab services. Prefer using specific services in new code. */
@Injectable()
export class TahesabService {
  private readonly logger = new Logger(TahesabService.name);

  constructor(private readonly tahesabHttpClient: TahesabHttpClient) { }

  async callMethod<K extends keyof TahesabMethodMap>(
    method: K,
    payload: TahesabMethodMap[K]['args'],
  ): Promise<TahesabMethodMap[K]['response']> {
    this.logger.debug(`Calling Tahesab method ${method}`);
    return this.tahesabHttpClient.call(method, payload);
  }

  // Customer / Moshtari
  async createCustomer(
    payload: DoNewMoshtariRequestDto,
  ): Promise<DoNewMoshtariResponseDto> {
    const p = payload;
    const payloadArray = [
      p.name,
      p.groupName,
      p.tel,
      p.address,
      p.nationalCode,
      p.birthDateShamsi ?? '',
      p.referrerName ?? '',
      p.referrerCode ?? '',
      p.moshtariCode ?? -1,
      p.jensFelez ?? 0,
    ];


    return this.callMethod('DoNewMoshtari', payloadArray as any);
  }

  async updateCustomer(
    payload: DoEditMoshtariRequestDto,
  ): Promise<DoEditMoshtariResponseDto> {
    const p = payload;
    const payloadArray = [
      p.moshtariCode,
      p.name,
      p.groupName,
      p.tel,
      p.address,
      p.nationalCode,
      p.birthDateShamsi ?? '',
      p.referrerName ?? '',
      p.referrerCode ?? '',
      p.description ?? '',
    ];

    return this.callMethod('DoEditMoshtari', payloadArray as any);
  }

  async listCustomers(
    payload: DoListMoshtariRequestDto,
  ): Promise<DoListMoshtariResponseDto> {
    const payloadArray =
      payload.mobile !== undefined
        ? [payload.mobile]
        : [payload.fromCode ?? '', payload.toCode ?? ''];

    return this.callMethod('DoListMoshtari', payloadArray as any);

    // return this.callMethod< DoListMoshtariResponseDto>(
    //   'DoListMoshtari',
    //   payloadArray,
    // );
  }

  async getCustomerByCode(
    payload: GetMoshtariByCodeRequestDto,
  ): Promise<GetMoshtariByCodeResponseDto> {
    return this.callMethod('GetMoshtariByCode', [payload.customerCode]);
  }

  // Balance / Account
  async getBalanceByGId(
    payload: GetMandeHesabByGidRequestDto,
  ): Promise<GetMandeHesabResponseDto> {
    return this.callMethod('GetMandeHesabByGID', [payload.gid]);
  }

  async getBalanceByCustomerCode(
    payload: GetMandeHesabByCodeRequestDto,
  ): Promise<GetMandeHesabResponseDto[]> {
    const payloadArray = [payload.customerCodes];

    return this.callMethod('getmandehesabbycode', payloadArray as any);
  }

  async getBalanceByDate(
    payload: GetMandeHesabByDateRequestDto,
  ): Promise<GetMandeHesabResponseDto> {
    return this.callMethod('GetMandeHesabByTarikh', [
      payload.customerCode,
      payload.dateShamsi,
    ]);
  }

  // Documents / Statement
  async listDocuments(
    payload: DoListAsnadRequestDto,
  ): Promise<DoListAsnadResponseDto> {
    const payloadArray = [
      payload.countLast,
      payload.customerCode,
      payload.fromDateShamsi,
      payload.toDateShamsi,
      payload.filterNoSanad ?? '',
      payload.jensFelez ?? 0,
    ];

    return this.callMethod('DoListAsnad', payloadArray as any);
  }

  // Inventory
  async getAbshodeInventory(
    payload: GetMojoodiAbshodeRequestDto,
  ): Promise<GetMojoodiAbshodeResponseDto> {
    const payloadArray = [payload.ayar, payload.jensFelez];

    return this.callMethod('GetMojoodiAbshodeMotefareghe', payloadArray as any);

  }

  async getAbshodeSekeCurrencyBalance(
    payload: DoTarazAbshodeSekehArzRequestDto,
  ): Promise<DoTarazAbshodeSekehArzResponseDto> {
    const rows = await this.callMethod(
      'DoTarazAbshodeSekehArz',
      [payload.includeCoin ? 1 : 0, payload.jensFelez],
    );

    return {
      balances: rows,
    };

  }

  // Etiket / RFID
  async listEtikets(
    payload: DoListEtiketRequestDto,
  ): Promise<DoListEtiketResponseDto> {
    const payloadArray = [
      payload.fromCode ?? '',
      payload.toCode ?? '',
      payload.withPhoto ? 1 : 0,
    ];
    return this.callMethod(
      'DoListEtiket',
      payloadArray as any,
    );
  }

  async listUpdatedEtikets(
    payload: DoListGetUpdatedEtiketRequestDto,
  ): Promise<DoListGetUpdatedEtiketResponseDto> {
    const payloadArray = [payload.fromDateTime, payload.toDateTime];
    return this.callMethod(
      'DoListGetUpdatedEtiket',
      payloadArray as any,
    );
  }

  async getEtiketTableInfo(): Promise<GetEtiketTableInfoResponseDto> {
    return this.callMethod(
      'GetEtiketTableInfo',
      [],
    );
  }

  async getItemInfo(payload: GetInfoRequestDto): Promise<GetInfoResponseDto> {
    return this.callMethod('GetInfo', [payload.epcList]);
  }

  async getItemInfoWithImage(
    payload: GetInfoWithImageRequestDto,
  ): Promise<GetInfoWithImageResponseDto> {
    return this.callMethod('GetInfoWithImage', [payload.epcList]);
  }

  async getEtiketInfoByCode(
    payload: GetEtiketInfoByCodeRequestDto,
  ): Promise<GetInfoResponseDto> {
    return this.callMethod('getetiketinfobycode', [payload.codes]);
  }

  async getEtiketInfoByCodeWithImage(
    payload: GetEtiketInfoByCodeRequestDto,
  ): Promise<GetInfoWithImageResponseDto> {
    return this.callMethod('getetiketinfobycodewithimage', [payload.codes]);
  }

  async clearEtiketRfid(
    payload: SetEtiketRFIDClearRequestDto,
  ): Promise<SetEtiketRFIDClearResponseDto> {
    return this.callMethod('SetEtiketRFIDClear', [payload.code]);
  }

  // Sanad / Vouchers
  async createGoldVoucher(
    payload: DoNewSanadGoldRequestDto,
  ): Promise<TahesabDocumentResult> {
    const p = payload;
    const payloadArray = [
      p.sabteKolOrMovaghat,
      p.moshtariCode,
      p.factorNumber,
      p.radifNumber,
      p.shamsiYear,
      p.shamsiMonth,
      p.shamsiDay,
      p.vazn,
      p.ayar,
      p.angNumber,
      p.nameAz,
      p.isVoroodOrKhorooj,
      p.isMotefaregheOrAbshode,
      p.sharh,
      p.factorCode,
      p.havalehBeMcode ?? '',
      p.multiRadif ?? 0,
      p.jensFelez ?? 0,
    ];
    return this.callMethod(
      'DoNewSanadVKHGOLD',
      payloadArray as any,
    );
  }

  async deleteVoucher(
    payload: DoDeleteSanadRequestDto,
  ): Promise<DoDeleteSanadResponseDto> {
    return this.callMethod('DoDeleteSanad', [payload.factorCode]);
  }

  async inquireVoucher(
    payload: DoNewSanadInquiryRequestDto,
  ): Promise<DoNewSanadInquiryResponseDto> {
    const payloadArray = [
      payload.moshtariCode,
      payload.factorNumber,
      payload.shamsiYear,
      payload.shamsiMonth,
      payload.shamsiDay,
    ];
    return this.callMethod(
      'DoNewSanadInquiry',
      payloadArray as any,
    );
  }

  // Misc
  async ping(): Promise<PingResponseDto> {
    return this.callMethod('Ping', []);
  }

  async getBankBalance(
    payload: GetBankBalanceRequestDto,
  ): Promise<TahesabBalanceRowDto[]> {
    return this.callMethod('GetBankMande', [String(payload.bankCode)]);
  }

  async getCashboxBalance(
    payload: GetCashboxBalanceRequestDto,
  ): Promise<TahesabBalanceRowDto[]> {
    return this.callMethod('GetSandoghMande', [payload.cashboxCode]);
  }

  async listCoins(): Promise<DoListNameSekehResponseDto> {
    return this.callMethod('DoListNameSekeh', []);
  }

  async listBankAccounts(): Promise<DoListHesabBankiResponseDto> {
    return this.callMethod(
      'DoListHesabBanki',
      [],
    );
  }

  async listKarSakhte(): Promise<DoListNameKarSakhteResponseDto> {
    return this.callMethod(
      'DoListNameKarSakhte',
      [],
    );
  }

  async getMojoodiBank(
    payload: GetMojoodiBankRequestDto,
  ): Promise<BankBalance[]> {
    return this.callMethod('GetMojoodiBank', [String(payload.bankCode)]);
  }

  async getMojoodiKarSakhte(
    payload: GetMojoodiKarSakhteRequestDto,
  ): Promise<TahesabBalanceRowDto[]> {
    return this.callMethod('GetMojoodiKarSakhte', [payload.jensFelez]);
  }
}
