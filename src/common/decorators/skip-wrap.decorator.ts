import { SetMetadata } from '@nestjs/common';

export const SKIP_RESPONSE_WRAP_KEY = 'skipResponseWrap';

export const SkipWrap = () => SetMetadata(SKIP_RESPONSE_WRAP_KEY, true);
export const SkipResponseWrap = SkipWrap;
