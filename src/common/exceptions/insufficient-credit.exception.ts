import { BadRequestException } from '@nestjs/common';

export class InsufficientCreditException extends BadRequestException {
  constructor(message = 'Insufficient usable balance for this operation') {
    super(message);
  }
}
