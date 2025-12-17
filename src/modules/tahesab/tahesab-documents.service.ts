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
    return this.client.call('DoNewSanadVKHGOLD', payloadArray as any);
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
    return this.client.call('DoNewSanadBuySaleGOLD', payloadArray as any);
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
    return this.client.call('DoNewSanadVKHSEKEH', payloadArray as any);
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
    return this.client.call('DoNewSanadBuySaleSEKEH', payloadArray as any);
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
    return this.client.call('DoNewSanadVKHVaghNaghd', payloadArray as any);
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
    return this.client.call('DoNewSanadVKHBank', payloadArray as any);
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
    return this.client.call('DoNewSanadTakhfif', payloadArray as any);
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
    return this.client.call('DoNewSanadTalabBedehi', payloadArray as any);
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
    return this.client.call('DoNewSanadBuySaleKar', payloadArray as any);
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
    return this.client.call('DoNewSanadVKHKar', payloadArray as any);
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
    return this.client.call('DoNewSanadBuySaleEtiket', payloadArray as any);
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
    return this.client.call('DoNewSanadVKHEtiket', payloadArray as any);
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
    return this.client.call('DoNewSanadInquiry', payloadArray as any);
  }
}
