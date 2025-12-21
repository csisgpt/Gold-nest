import { BadRequestException } from '@nestjs/common';

export type PolicyViolationCode = 'LIMIT_EXCEEDED' | 'KYC_REQUIRED';

export class PolicyViolationException extends BadRequestException {
  constructor(code: PolicyViolationCode, message?: string) {
    super({ code, message: message || code });
  }
}
