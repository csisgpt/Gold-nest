import { Prisma, User } from '@prisma/client';

export const userSafeSelect = {
  id: true,
  fullName: true,
  mobile: true,
  email: true,
  role: true,
  status: true,
  customerGroupId: true,
  tahesabCustomerCode: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type UserSafeEntity = Prisma.UserGetPayload<{ select: typeof userSafeSelect }>;

export interface UserSafeDto {
  id: string;
  fullName: string;
  mobile: string;
  email: string;
  role: User['role'];
  status: User['status'];
  customerGroupId: string | null;
  tahesabCustomerCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function mapUserSafe(user: UserSafeEntity): UserSafeDto {
  return {
    id: user.id,
    fullName: user.fullName,
    mobile: user.mobile,
    email: user.email,
    role: user.role,
    status: user.status,
    customerGroupId: user.customerGroupId,
    tahesabCustomerCode: user.tahesabCustomerCode,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
