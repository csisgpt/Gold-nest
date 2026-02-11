import { Prisma } from '@prisma/client';
import { mapUserSafe, userSafeSelect } from '../../users/mappers/user-safe.mapper';
import { AdminGroupUserRowDto } from '../dto/admin-group-user-row.dto';

export type AdminGroupUserRowEntity = Prisma.UserGetPayload<{
  select: {
    id: true;
    fullName: true;
    mobile: true;
    email: true;
    role: true;
    status: true;
    customerGroupId: true;
    tahesabCustomerCode: true;
    createdAt: true;
    updatedAt: true;
    customerGroup: { select: { id: true; code: true; name: true; tahesabGroupName: true } };
    userKyc: { select: { status: true; level: true } };
  };
}>;

export const adminGroupUserRowSelect = {
  ...userSafeSelect,
  customerGroup: { select: { id: true, code: true, name: true, tahesabGroupName: true } },
  userKyc: { select: { status: true, level: true } },
} as const;

export function mapAdminGroupUserRow(user: AdminGroupUserRowEntity): AdminGroupUserRowDto {
  return {
    ...mapUserSafe(user),
    customerGroup: user.customerGroup
      ? {
          id: user.customerGroup.id,
          code: user.customerGroup.code,
          name: user.customerGroup.name,
          tahesabGroupName: user.customerGroup.tahesabGroupName ?? null,
        }
      : null,
    kyc: user.userKyc
      ? {
          status: user.userKyc.status,
          level: user.userKyc.level,
        }
      : null,
  };
}
