import { Prisma } from '@prisma/client';

export const userMinimalSelect: Prisma.UserSelect = {
  id: true,
  fullName: true,
  mobile: true,
};

export const userSafeSelect: Prisma.UserSelect = {
  ...userMinimalSelect,
  email: true,
  role: true,
  status: true,
  tahesabCustomerCode: true,
  createdAt: true,
  updatedAt: true,
};
