import { Injectable } from '@nestjs/common';
import { TahesabHttpClient } from './tahesab-http.client';
import {
  DoEditMoshtariRequestDto,
  DoListMoshtariRequestDto,
  DoNewMoshtariRequestDto,
  GetMoshtariByCodeRequestDto,
} from './dto/moshtari.dto';
import {
  GetMandeHesabByCodeRequestDto,
  GetMandeHesabByDateRequestDto,
  GetMandeHesabByGidRequestDto,
} from './dto/customer-balance.dto';

@Injectable()
export class TahesabAccountsService {
  constructor(private readonly client: TahesabHttpClient) {}

  async createCustomer(dto: DoNewMoshtariRequestDto) {
    const p = dto;
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
    return this.client.call('DoNewMoshtari', payloadArray);
  }

  async updateCustomer(dto: DoEditMoshtariRequestDto) {
    const p = dto;
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
    return this.client.call('DoEditMoshtari', payloadArray);
  }

  async listCustomers(dto: DoListMoshtariRequestDto) {
    const payloadArray = dto.mobile
      ? [dto.mobile]
      : [dto.fromCode ?? '', dto.toCode ?? ''];
    return this.client.call('DoListMoshtari', payloadArray);
  }

  async getCustomerByCode(dto: GetMoshtariByCodeRequestDto) {
    return this.client.call('GetMoshtariByCode', [dto.customerCode]);
  }

  async getBalanceByGId(dto: GetMandeHesabByGidRequestDto) {
    return this.client.call('GetMandeHesabByGID', [dto.gid]);
  }

  async getBalanceByCustomerCode(dto: GetMandeHesabByCodeRequestDto) {
    const payloadArray = [dto.customerCodes];
    return this.client.call('getmandehesabbycode', payloadArray);
  }

  async getBalanceByDate(dto: GetMandeHesabByDateRequestDto) {
    const payloadArray = [dto.customerCode, dto.dateShamsi];
    return this.client.call('GetMandeHesabByTarikh', payloadArray);
  }
}
