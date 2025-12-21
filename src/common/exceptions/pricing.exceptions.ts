import { BadRequestException } from '@nestjs/common';

export class InvalidOverrideModeException extends BadRequestException {
  constructor(message = 'Invalid override payload for selected mode') {
    super(message);
  }
}

export class OverrideExpiredException extends BadRequestException {
  constructor(message = 'Override expiration must be in the future') {
    super(message);
  }
}

export class ProviderMappingConflictException extends BadRequestException {
  constructor(message = 'Duplicate or conflicting provider mapping') {
    super(message);
  }
}
