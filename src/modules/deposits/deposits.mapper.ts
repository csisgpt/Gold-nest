import { Prisma } from '@prisma/client';
import { userSafeSelect, userMinimalSelect } from '../../common/prisma/selects/user.select';
import { toUserMinimalDto, toUserSafeDto } from '../../common/mappers/user.mapper';
import { DepositResponseDto } from './dto/response/deposit-response.dto';

export const depositWithUserSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  amount: true,
  method: true,
  status: true,
  refNo: true,
  note: true,
  processedAt: true,
  processedById: true,
  accountTxId: true,
  user: { select: userSafeSelect },
  processedBy: { select: userMinimalSelect },
} satisfies Prisma.DepositRequestSelect;

export type DepositWithUser = Prisma.DepositRequestGetPayload<{
  select: typeof depositWithUserSelect;
}>;

export class DepositsMapper {
  static toResponse(deposit: DepositWithUser): DepositResponseDto {
    return {
      id: deposit.id,
      userId: deposit.userId,
      user: toUserSafeDto(deposit.user),
      amount: deposit.amount.toString(),
      method: deposit.method,
      status: deposit.status,
      refNo: deposit.refNo,
      note: deposit.note,
      processedAt: deposit.processedAt ?? null,
      processedById: deposit.processedById ?? null,
      processedBy: toUserMinimalDto(deposit.processedBy),
      accountTxId: deposit.accountTxId ?? null,
      createdAt: deposit.createdAt,
      updatedAt: deposit.updatedAt,
    };
  }

  static toResponses(deposits: DepositWithUser[]): DepositResponseDto[] {
    return deposits.map((deposit) => this.toResponse(deposit));
  }
}
