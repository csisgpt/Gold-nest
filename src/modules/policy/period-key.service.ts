import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

const DEFAULT_POLICY_TZ = 'Asia/Tehran';

@Injectable()
export class PeriodKeyService {
  private readonly tz: string;

  constructor() {
    this.tz = process.env.POLICY_TZ || DEFAULT_POLICY_TZ;
  }

  getDailyKey(date: Date = new Date(), tz?: string) {
    return DateTime.fromJSDate(date, { zone: tz || this.tz }).toFormat('yyyy-LL-dd');
  }

  getMonthlyKey(date: Date = new Date(), tz?: string) {
    return DateTime.fromJSDate(date, { zone: tz || this.tz }).toFormat('yyyy-LL');
  }
}
