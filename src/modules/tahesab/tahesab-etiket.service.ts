import { Injectable } from '@nestjs/common';
import { TahesabHttpClient } from './tahesab-http.client';
import {
  DoListEtiketRequestDto,
  DoListGetUpdatedEtiketRequestDto,
  GetEtiketInfoByCodeRequestDto,
} from './dto/etiket.dto';

@Injectable()
export class TahesabEtiketService {
  constructor(private readonly client: TahesabHttpClient) {}

  async getEtiketPictureByFileName(fileName: string) {
    return this.client.call('GetEtiketPictureByFileName', [fileName]);
  }

  async getEtiketInfoByCode(dto: GetEtiketInfoByCodeRequestDto) {
    return this.client.call('getetiketinfobycode', [dto.codes]);
  }

  async getEtiketInfoWithImage(dto: GetEtiketInfoByCodeRequestDto) {
    return this.client.call('getetiketinfobycodewithimage', [dto.codes]);
  }

  async listEtikets(dto: DoListEtiketRequestDto) {
    const payloadArray = [dto.fromCode ?? '', dto.toCode ?? '', dto.withPhoto ? 1 : 0];
    return this.client.call('DoListEtiket', payloadArray as any);
  }

  async listUpdatedEtikets(dto: DoListGetUpdatedEtiketRequestDto) {
    const payloadArray = [dto.fromDateTime, dto.toDateTime];
    return this.client.call('DoListGetUpdatedEtiket', payloadArray as any);
  }

  async listEtiketsByCodeKar(codeKar: string) {
    return this.client.call('DoList_EtiketByCodeKar', [codeKar]);
  }

  async getEtiketTableInfo() {
    return this.client.call('GetEtiketTableInfo', []);
  }

  async clearEtiketRFID(code: string | number) {
    return this.client.call('SetEtiketRFIDClear', [code]);
  }
}
