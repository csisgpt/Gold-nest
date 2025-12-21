import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';

@Injectable()
export class PolicyMetricsService {
  toNotionalIrr(amount: Decimal | string | number) {
    return new Decimal(amount);
  }

  toWeight750(weightGram: Decimal | string | number) {
    return new Decimal(weightGram);
  }

  toCount(quantity: Decimal | string | number) {
    return new Decimal(quantity);
  }
}
