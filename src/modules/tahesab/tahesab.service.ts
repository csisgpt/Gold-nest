import { Injectable, Logger } from '@nestjs/common';
import { TahesabHttpClient } from './tahesab-http.client';
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
  GetEtiketTableInfoRequestDto,
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
  GetBankBalanceRequestDto,
  GetBankBalanceResponseDto,
  GetCashboxBalanceRequestDto,
  GetCashboxBalanceResponseDto,
  PingResponseDto,
} from './dto/common.dto';

@Injectable()
export class TahesabService {
  private readonly logger = new Logger(TahesabService.name);

  constructor(private readonly tahesabHttpClient: TahesabHttpClient) {}

  async callMethod<TPayload, TResponse>(
    method: string,
    payload: TPayload,
  ): Promise<TResponse> {
    const body = { [method]: payload } as Record<string, TPayload>;
    this.logger.debug(`Calling Tahesab method ${method}`);
    return this.tahesabHttpClient.post<typeof body, TResponse>(body);
  }

  // Customer / Moshtari
  async createCustomer(
    payload: DoNewMoshtariRequestDto,
  ): Promise<DoNewMoshtariResponseDto> {
    return this.callMethod('DoNewMoshtari', payload);
  }

  async updateCustomer(
    payload: DoEditMoshtariRequestDto,
  ): Promise<DoEditMoshtariResponseDto> {
    return this.callMethod('DoEditMoshtari', payload);
  }

  async listCustomers(
    payload: DoListMoshtariRequestDto,
  ): Promise<DoListMoshtariResponseDto> {
    const payloadArray = [
      payload.countLast ?? null,
      payload.customerCode ?? null,
      payload.fromDateShamsi ?? null,
      payload.toDateShamsi ?? null,
      payload.searchTerm ?? null,
    ];
    return this.callMethod<typeof payloadArray, DoListMoshtariResponseDto>(
      'DoListMoshtari',
      payloadArray,
    );
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
  ): Promise<GetMandeHesabResponseDto> {
    return this.callMethod('getmandehesabbycode', [payload.customerCode]);
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
      payload.filterNoSanad ?? null,
      payload.metalType ?? null,
    ];
    return this.callMethod<typeof payloadArray, DoListAsnadResponseDto>(
      'DoListAsnad',
      payloadArray,
    );
  }

  // Inventory
  async getAbshodeInventory(
    payload: GetMojoodiAbshodeRequestDto,
  ): Promise<GetMojoodiAbshodeResponseDto> {
    const payloadArray = [payload.includeDetails ?? false, payload.metalType ?? null];
    return this.callMethod<typeof payloadArray, GetMojoodiAbshodeResponseDto>(
      'GetMojoodiAbshodeMotefareghe',
      payloadArray,
    );
  }

  async getAbshodeSekeCurrencyBalance(
    payload: DoTarazAbshodeSekehArzRequestDto,
  ): Promise<DoTarazAbshodeSekehArzResponseDto> {
    const payloadArray = [
      payload.fromDateShamsi,
      payload.toDateShamsi,
      payload.metalType ?? null,
    ];
    return this.callMethod<typeof payloadArray, DoTarazAbshodeSekehArzResponseDto>(
      'DoTarazAbshodeSekehArz',
      payloadArray,
    );
  }

  // Etiket / RFID
  async listEtikets(
    payload: DoListEtiketRequestDto,
  ): Promise<DoListEtiketResponseDto> {
    const payloadArray = [
      payload.countLast ?? null,
      payload.updatedAfter ?? null,
      payload.includeImages ?? false,
    ];
    return this.callMethod<typeof payloadArray, DoListEtiketResponseDto>(
      'DoListEtiket',
      payloadArray,
    );
  }

  async listUpdatedEtikets(
    payload: DoListGetUpdatedEtiketRequestDto,
  ): Promise<DoListGetUpdatedEtiketResponseDto> {
    return this.callMethod(
      'DoListGetUpdatedEtiket',
      [payload.lastSyncDateTime ?? null],
    );
  }

  async getEtiketTableInfo(
    payload: GetEtiketTableInfoRequestDto,
  ): Promise<GetEtiketTableInfoResponseDto> {
    return this.callMethod('GetEtiketTableInfo', [payload.tableName ?? null]);
  }

  async getItemInfo(payload: GetInfoRequestDto): Promise<GetInfoResponseDto> {
    return this.callMethod('GetInfo', [payload.barcode]);
  }

  async getItemInfoWithImage(
    payload: GetInfoWithImageRequestDto,
  ): Promise<GetInfoWithImageResponseDto> {
    return this.callMethod('GetInfoWithImage', [payload.barcode]);
  }

  async clearEtiketRfid(
    payload: SetEtiketRFIDClearRequestDto,
  ): Promise<SetEtiketRFIDClearResponseDto> {
    return this.callMethod('SetEtiketRFIDClear', [
      payload.barcode,
      payload.rfid ?? null,
    ]);
  }

  // Sanad / Vouchers
  async createGoldVoucher(
    payload: DoNewSanadGoldRequestDto,
  ): Promise<DoNewSanadGoldResponseDto> {
    return this.callMethod('DoNewSanadVKHGOLD', payload);
  }

  async deleteVoucher(
    payload: DoDeleteSanadRequestDto,
  ): Promise<DoDeleteSanadResponseDto> {
    return this.callMethod('DoDeleteSanad', [
      payload.sanadNo,
      payload.reason ?? null,
    ]);
  }

  async inquireVoucher(
    payload: DoNewSanadInquiryRequestDto,
  ): Promise<DoNewSanadInquiryResponseDto> {
    return this.callMethod('DoNewSanadInquiry', [payload.sanadNo]);
  }

  // Misc
  async ping(): Promise<PingResponseDto> {
    return this.callMethod('Ping', []);
  }

  async getBankBalance(
    payload: GetBankBalanceRequestDto,
  ): Promise<GetBankBalanceResponseDto> {
    return this.callMethod('GetBankMande', [
      payload.bankCode ?? null,
      payload.fromDateShamsi ?? null,
      payload.toDateShamsi ?? null,
    ]);
  }

  async getCashboxBalance(
    payload: GetCashboxBalanceRequestDto,
  ): Promise<GetCashboxBalanceResponseDto> {
    return this.callMethod('GetSandoghMande', [payload.cashboxCode ?? null]);
  }
}
