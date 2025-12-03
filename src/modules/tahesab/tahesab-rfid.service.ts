import { Injectable } from '@nestjs/common';
import { TahesabHttpClient } from './tahesab-http.client';

@Injectable()
export class TahesabRfidService {
  constructor(private readonly client: TahesabHttpClient) {}

  async getRfidInfo(epcs: string[]) {
    return this.client.call('GetInfo', [epcs]);
  }

  async getRfidInfoWithImage(epcs: string[]) {
    return this.client.call('GetInfoWithImage', [epcs]);
  }

  async sendEpcList(epcs: string[]) {
    return this.client.call('epcList', [epcs]);
  }
}
