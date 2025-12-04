import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';

export interface TahesabDateParts {
  shamsiYear: string;
  shamsiMonth: string;
  shamsiDay: string;
}

@Injectable()
export class TahesabIntegrationConfigService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    const flag = this.configService.get<string>('TAHESAB_ENABLED');
    return flag === undefined || flag === 'true' || flag === '1';
  }

  getCustomerCode(user?: Pick<User, 'tahesabCustomerCode'> | null): string | null {
    return user?.tahesabCustomerCode ?? null;
  }

  getDefaultCashAccountCode(): string | null {
    return (
      this.configService.get<string>('TAHESAB_DEFAULT_CASH_ACCOUNT_CODE') ??
      this.configService.get<string>('TAHESAB_DEFAULT_BANK_ACCOUNT_CODE') ??
      null
    );
  }

  getGoldAccountCode(): string | null {
    return this.configService.get<string>('TAHESAB_DEFAULT_GOLD_ACCOUNT_CODE') ?? null;
  }

  getDescriptionPrefix(): string {
    return this.configService.get<string>('TAHESAB_DEFAULT_DOC_DESCRIPTION_PREFIX') ?? 'GN';
  }

  formatDateParts(dateInput?: Date | string | null): TahesabDateParts {
    const date = dateInput ? new Date(dateInput) : new Date();
    const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

    return {
      shamsiYear: getPart('year'),
      shamsiMonth: getPart('month'),
      shamsiDay: getPart('day'),
    };
  }
}
