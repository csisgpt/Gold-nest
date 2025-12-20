import { Prisma } from '@prisma/client';
import { userMinimalSelect, userSafeSelect } from '../../common/prisma/selects/user.select';
import { toUserMinimalDto, toUserSafeDto } from '../../common/mappers/user.mapper';
import { WithdrawalResponseDto } from './dto/response/withdrawal-response.dto';

export const withdrawalWithUserSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  amount: true,
  status: true,
  bankName: true,
  iban: true,
  cardNumber: true,
  note: true,
  processedAt: true,
  processedById: true,
  accountTxId: true,
  user: { select: userSafeSelect },
  processedBy: { select: userMinimalSelect },
} satisfies Prisma.WithdrawRequestSelect;

export type WithdrawalWithUser = Prisma.WithdrawRequestGetPayload<{
  select: typeof withdrawalWithUserSelect;
}>;

export class WithdrawalsMapper {
  static toResponse(withdrawal: WithdrawalWithUser): WithdrawalResponseDto {
    return {
      id: withdrawal.id,
      userId: withdrawal.userId,
      user: toUserSafeDto(withdrawal.user),
      amount: withdrawal.amount.toString(),
      status: withdrawal.status,
      bankName: withdrawal.bankName,
      iban: withdrawal.iban,
      cardNumber: withdrawal.cardNumber,
      note: withdrawal.note,
      processedAt: withdrawal.processedAt ?? null,
      processedById: withdrawal.processedById ?? null,
      processedBy: toUserMinimalDto(withdrawal.processedBy),
      accountTxId: withdrawal.accountTxId ?? null,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
    };
  }

  static toResponses(withdrawals: WithdrawalWithUser[]): WithdrawalResponseDto[] {
    return withdrawals.map((withdrawal) => this.toResponse(withdrawal));
  }
}
