import { Injectable } from '@nestjs/common';
import { TahesabHttpClient } from './tahesab-http.client';
import { DoListAsnadRequestDto } from './dto/list-documents.dto';
import {
  DoDeleteSanadRequestDto,
  DoNewSanadInquiryRequestDto,
} from './dto/sanad.dto';

@Injectable()
export class TahesabDocsReportService {
  constructor(private readonly client: TahesabHttpClient) {}

  async listDocuments(dto: DoListAsnadRequestDto) {
    const payloadArray = [
      dto.countLast,
      dto.customerCode,
      dto.fromDateShamsi,
      dto.toDateShamsi,
      dto.filterNoSanad ?? '',
      dto.jensFelez ?? 0,
    ];
    return this.client.call('DoListAsnad', payloadArray);
  }

  async inquiryDocument(dto: DoNewSanadInquiryRequestDto) {
    const payloadArray = [
      dto.moshtariCode,
      dto.factorNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
    ];
    return this.client.call('DoNewSanadInquiry', payloadArray);
  }

  async deleteDocument(dto: DoDeleteSanadRequestDto) {
    return this.client.call('DoDeleteSanad', [dto.factorCode]);
  }
}
