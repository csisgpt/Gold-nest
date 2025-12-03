import { Injectable } from '@nestjs/common';
import { TahesabHttpClient } from './tahesab-http.client';
import { SabteKolOrMovaghat, JensFelez } from './tahesab.methods';
import {
  DoDeleteSanadRequestDto,
  DoNewSanadGoldRequestDto,
  DoNewSanadInquiryRequestDto,
} from './dto/sanad.dto';

export interface GoldBuySellDto {
  sabteKolOrMovaghat: SabteKolOrMovaghat;
  moshtariCode: string | number;
  factorNumber: string | number;
  shamsiYear: string;
  shamsiMonth: string;
  shamsiDay: string;
  mablagh: number | string;
  ayar: number | string;
  vazn: number | string;
  angNumber: string;
  nameAz: string;
  buyOrSale: number;
  sharh?: string;
  factorCode?: string | number;
  jensFelez?: JensFelez;
}

export interface SimpleVoucherDto {
  sabteKolOrMovaghat: SabteKolOrMovaghat;
  moshtariCode: string | number;
  factorNumber: string | number;
  shamsiYear: string;
  shamsiMonth: string;
  shamsiDay: string;
  mablagh: number | string;
  sharh?: string;
  factorCode?: string | number;
}

/** Tahesab voucher/document wrappers converting DTOs to positional arrays. */
@Injectable()
export class TahesabDocumentsService {
  constructor(private readonly client: TahesabHttpClient) {}

  async createGoldInOut(dto: DoNewSanadGoldRequestDto) {
    const p = dto;
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
    return this.client.call('DoNewSanadVKHGOLD', payloadArray);
  }

  async createGoldBuySell(dto: GoldBuySellDto) {
    const payloadArray = [
      dto.sabteKolOrMovaghat,
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
      dto.mablagh,
      dto.ayar,
      dto.vazn,
      dto.angNumber,
      dto.nameAz,
      dto.buyOrSale,
      dto.sharh ?? '',
      dto.factorCode ?? '',
      dto.jensFelez ?? JensFelez.Gold,
    ];
    return this.client.call('DoNewSanadBuySaleGOLD', payloadArray);
  }

  async createSekehInOut(dto: GoldBuySellDto) {
    const payloadArray = [
      dto.sabteKolOrMovaghat,
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
      dto.mablagh,
      dto.ayar,
      dto.vazn,
      dto.angNumber,
      dto.nameAz,
      dto.buyOrSale,
      dto.sharh ?? '',
      dto.factorCode ?? '',
      dto.jensFelez ?? JensFelez.Gold,
    ];
    return this.client.call('DoNewSanadVKHSEKEH', payloadArray);
  }

  async createSekehBuySell(dto: GoldBuySellDto) {
    const payloadArray = [
      dto.sabteKolOrMovaghat,
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
      dto.mablagh,
      dto.ayar,
      dto.vazn,
      dto.angNumber,
      dto.nameAz,
      dto.buyOrSale,
      dto.sharh ?? '',
      dto.factorCode ?? '',
      dto.jensFelez ?? JensFelez.Gold,
    ];
    return this.client.call('DoNewSanadBuySaleSEKEH', payloadArray);
  }

  async createCashInOut(dto: SimpleVoucherDto) {
    const payloadArray = [
      dto.sabteKolOrMovaghat,
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
      dto.mablagh,
      dto.sharh ?? '',
      dto.factorCode ?? '',
    ];
    return this.client.call('DoNewSanadVKHVaghNaghd', payloadArray);
  }

  async createBankInOut(dto: SimpleVoucherDto) {
    const payloadArray = [
      dto.sabteKolOrMovaghat,
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
      dto.mablagh,
      dto.sharh ?? '',
      dto.factorCode ?? '',
    ];
    return this.client.call('DoNewSanadVKHBank', payloadArray);
  }

  async createDiscount(dto: SimpleVoucherDto) {
    const payloadArray = [
      dto.sabteKolOrMovaghat,
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
      dto.mablagh,
      dto.sharh ?? '',
      dto.factorCode ?? '',
    ];
    return this.client.call('DoNewSanadTakhfif', payloadArray);
  }

  async createTalabBedehi(dto: SimpleVoucherDto) {
    const payloadArray = [
      dto.sabteKolOrMovaghat,
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
      dto.mablagh,
      dto.sharh ?? '',
      dto.factorCode ?? '',
    ];
    return this.client.call('DoNewSanadTalabBedehi', payloadArray);
  }

  async createKarsakhteBuySell(dto: GoldBuySellDto) {
    const payloadArray = [
      dto.sabteKolOrMovaghat,
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
      dto.mablagh,
      dto.ayar,
      dto.vazn,
      dto.angNumber,
      dto.nameAz,
      dto.buyOrSale,
      dto.sharh ?? '',
      dto.factorCode ?? '',
      dto.jensFelez ?? JensFelez.Gold,
    ];
    return this.client.call('DoNewSanadBuySaleKar', payloadArray);
  }

  async createKarsakhteInOut(dto: GoldBuySellDto) {
    const payloadArray = [
      dto.sabteKolOrMovaghat,
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
      dto.mablagh,
      dto.ayar,
      dto.vazn,
      dto.angNumber,
      dto.nameAz,
      dto.buyOrSale,
      dto.sharh ?? '',
      dto.factorCode ?? '',
      dto.jensFelez ?? JensFelez.Gold,
    ];
    return this.client.call('DoNewSanadVKHKar', payloadArray);
  }

  async createEtiketBuySell(dto: GoldBuySellDto) {
    const payloadArray = [
      dto.sabteKolOrMovaghat,
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
      dto.mablagh,
      dto.ayar,
      dto.vazn,
      dto.angNumber,
      dto.nameAz,
      dto.buyOrSale,
      dto.sharh ?? '',
      dto.factorCode ?? '',
      dto.jensFelez ?? JensFelez.Gold,
    ];
    return this.client.call('DoNewSanadBuySaleEtiket', payloadArray);
  }

  async createEtiketInOut(dto: GoldBuySellDto) {
    const payloadArray = [
      dto.sabteKolOrMovaghat,
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
      dto.mablagh,
      dto.ayar,
      dto.vazn,
      dto.angNumber,
      dto.nameAz,
      dto.buyOrSale,
      dto.sharh ?? '',
      dto.factorCode ?? '',
      dto.jensFelez ?? JensFelez.Gold,
    ];
    return this.client.call('DoNewSanadVKHEtiket', payloadArray);
  }

  async deleteDocument(dto: DoDeleteSanadRequestDto) {
    return this.client.call('DoDeleteSanad', [dto.factorCode]);
  }

  async inquireDocument(dto: DoNewSanadInquiryRequestDto) {
    const payloadArray = [
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
    ];
    return this.client.call('DoNewSanadInquiry', payloadArray);
  }
}
