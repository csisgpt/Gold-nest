import { Injectable, Logger } from '@nestjs/common';
import {
  Instrument,
  InstrumentType,
  Remittance,
  RemittanceChannel,
  RemittanceGroup,
  User,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { SabteKolOrMovaghat, TahesabOutboxAction } from './tahesab.methods';
import { SimpleVoucherDto } from './tahesab-documents.service';
import { TahesabOutboxService } from './tahesab-outbox.service';
import { TahesabIntegrationConfigService } from './tahesab-integration.config';

export type RemittanceForTahesab = Remittance & {
  group?: RemittanceGroup | null;
  instrument: Instrument;
  fromUser: User;
  toUser: User;
};

@Injectable()
export class TahesabRemittancesService {
  private readonly logger = new Logger(TahesabRemittancesService.name);

  constructor(
    private readonly tahesabOutbox: TahesabOutboxService,
    private readonly tahesabIntegration: TahesabIntegrationConfigService,
  ) {}

  private resolveVoucherMethod(channel: RemittanceChannel): TahesabOutboxAction {
    if (channel === RemittanceChannel.BANK_TRANSFER) {
      return 'DoNewSanadVKHBank';
    }
    return 'DoNewSanadVKHVaghNaghd';
  }

  private resolveAccountCode(leg: RemittanceForTahesab): string | null {
    if (leg.instrument.type === InstrumentType.GOLD) {
      return this.tahesabIntegration.getGoldAccountCode();
    }

    if (leg.channel === RemittanceChannel.BANK_TRANSFER) {
      return (
        this.tahesabIntegration.getDefaultBankAccountCode() ??
        this.tahesabIntegration.getDefaultCashAccountCode()
      );
    }

    return this.tahesabIntegration.getDefaultCashAccountCode();
  }

  private buildTahesabDescriptionForRemittance(leg: RemittanceForTahesab): string {
    const groupId = leg.group?.id ?? '-';
    const onBehalf = leg.onBehalfOfUserId ?? '-';
    return [
      'GN|RMT',
      `GRP=${groupId}`,
      `LEG=${leg.id}`,
      `FROM=${leg.fromUserId}`,
      `TO=${leg.toUserId}`,
      `INST=${leg.instrument.code}`,
      `AMT=${new Decimal(leg.amount).toString()}`,
      `CH=${leg.channel}`,
      `ONB=${onBehalf}`,
    ].join('|');
  }

  async enqueueRemittanceLeg(leg: RemittanceForTahesab): Promise<void> {
    if (!this.tahesabIntegration.isEnabled()) return;

    const toCustomerCode = this.tahesabIntegration.getCustomerCode(leg.toUser);
    const fromCustomerCode = this.tahesabIntegration.getCustomerCode(leg.fromUser);
    if (!toCustomerCode || !fromCustomerCode) {
      this.logger.debug(
        `Skipping Tahesab enqueue for remittance ${leg.id}; missing customer codes (from=${fromCustomerCode}, to=${toCustomerCode}).`,
      );
      return;
    }

    const accountCode = this.resolveAccountCode(leg);
    if (!accountCode) {
      this.logger.warn(`No Tahesab account code configured for remittance ${leg.id}`);
      return;
    }

    const { shamsiYear, shamsiMonth, shamsiDay } = this.tahesabIntegration.formatDateParts(
      leg.createdAt,
    );

    const dto: SimpleVoucherDto = {
      sabteKolOrMovaghat: SabteKolOrMovaghat.Kol,
      moshtariCode: toCustomerCode,
      factorNumber: leg.id,
      shamsiYear,
      shamsiMonth,
      shamsiDay,
      mablagh: new Decimal(leg.amount).abs().toNumber(),
      sharh: this.buildTahesabDescriptionForRemittance(leg),
      factorCode: accountCode,
    };

    const action = this.resolveVoucherMethod(leg.channel);

    await this.tahesabOutbox.enqueueOnce(action, dto, { correlationId: leg.id });
  }
}
