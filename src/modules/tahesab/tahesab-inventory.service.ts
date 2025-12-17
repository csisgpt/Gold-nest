import { Injectable } from '@nestjs/common';
import { TahesabHttpClient } from './tahesab-http.client';
import { JensFelez } from './tahesab.methods';
import {
  DoTarazAbshodeSekehArzRequestDto,
  GetMojoodiKarSakhteRequestDto,
} from './dto/inventory.dto';
import { GetMojoodiBankRequestDto } from './dto/common.dto';

@Injectable()
export class TahesabInventoryService {
  constructor(private readonly client: TahesabHttpClient) {}

  async getBankBalance(nameBank = '') {
    return this.client.call('GetMojoodiBank', [nameBank]);
  }

  async getAbshodeMojoodi(
    ayar: number,
    jensFelez: JensFelez = JensFelez.Gold,
  ) {
    return this.client.call('GetMojoodiAbshodeMotefareghe', [ayar, jensFelez]);
  }

  async getKarsakhteMojoodi(dto: GetMojoodiKarSakhteRequestDto) {
    return this.client.call('GetMojoodiKarSakhte', [dto.jensFelez]);
  }

  async getTarazAbshodeSekehArz(dto: DoTarazAbshodeSekehArzRequestDto) {
    return this.client.call('DoTarazAbshodeSekehArz', [
      dto.includeCoin ? 1 : 0,
      dto.jensFelez ?? JensFelez.Gold,
    ]);
  }

  async getMojoodiBank(dto: GetMojoodiBankRequestDto) {
    return this.client.call('GetMojoodiBank', [String(dto.bankCode)]);
  }

  async getMojoodiKarSakhte(dto: GetMojoodiKarSakhteRequestDto) {
    return this.client.call('GetMojoodiKarSakhte', [dto.jensFelez]);
  }
}
