import { Injectable } from '@nestjs/common';
import { TahesabHttpClient } from './tahesab-http.client';

@Injectable()
export class TahesabNamesService {
  constructor(private readonly client: TahesabHttpClient) {}

  async listCoins() {
    return this.client.call('DoListNameSekeh', []);
  }

  async listBankAccounts() {
    return this.client.call('DoListHesabBanki', []);
  }

  async listKarSakhte() {
    return this.client.call('DoListNameKarSakhte', []);
  }
}
