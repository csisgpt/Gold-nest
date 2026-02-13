import { InstrumentType, InstrumentUnit } from '@prisma/client';

export interface WalletAccountDto {
  instrument: {
    id: string;
    code: string;
    name: string;
    type: InstrumentType;
    unit: InstrumentUnit;
  };
  balance: string | null;
  blockedBalance: string | null;
  minBalance: string | null;
  available: string | null;
  balancesHidden: boolean;
  updatedAt: Date;
}
