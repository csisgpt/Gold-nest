import { KycStatus, KycLevel } from '@prisma/client';
import { UserSafeDto } from '../../users/mappers/user-safe.mapper';

export interface AdminGroupUserRowDto extends UserSafeDto {
  customerGroup: {
    id: string;
    code: string;
    name: string;
    tahesabGroupName: string | null;
  } | null;
  kyc: {
    status: KycStatus;
    level: KycLevel;
  } | null;
}
