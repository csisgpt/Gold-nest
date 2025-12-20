import { User } from '@prisma/client';
import { UserMinimalDto, UserSafeDto } from '../dto/user.dto';

export type MinimalUser = Pick<User, 'id' | 'fullName' | 'mobile'>;
export type SafeUser = MinimalUser &
  Pick<User, 'email' | 'role' | 'status' | 'tahesabCustomerCode' | 'createdAt' | 'updatedAt'>;

export function toUserMinimalDto(user?: MinimalUser | null): UserMinimalDto | null {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    mobile: user.mobile,
  };
}

export function toUserSafeDto(user?: SafeUser | null): UserSafeDto | null {
  if (!user) return null;
  return {
    ...toUserMinimalDto(user)!,
    email: user.email,
    role: user.role,
    status: user.status,
    tahesabCustomerCode: user.tahesabCustomerCode,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
