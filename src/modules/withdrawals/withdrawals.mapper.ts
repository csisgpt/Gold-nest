import { PaymentDestinationType, Prisma } from '@prisma/client';
import { userMinimalSelect, userSafeSelect } from '../../common/prisma/selects/user.select';
import { toUserMinimalDto, toUserSafeDto } from '../../common/mappers/user.mapper';
import { WithdrawalResponseDto } from './dto/response/withdrawal-response.dto';
import { maskDestinationValue, maskOwnerName } from '../payment-destinations/payment-destinations.crypto';

const PaymentDestinationTypeEnum =
  (PaymentDestinationType as any) ??
  ({
    IBAN: 'IBAN',
    CARD: 'CARD',
    ACCOUNT: 'ACCOUNT',
  } as const);

export const withdrawalWithUserSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  amount: true,
  status: true,
  purpose: true,
  bankName: true,
  iban: true,
  cardNumber: true,
  destinationSnapshot: true,
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
  static resolveDestination(withdrawal: WithdrawalWithUser): WithdrawalResponseDto['destination'] {
    const snapshot = withdrawal.destinationSnapshot as {
      type?: PaymentDestinationType;
      maskedValue?: string;
      value?: string;
      bankName?: string | null;
      ownerName?: string | null;
    } | null;

    if (snapshot?.type) {
      const maskedValue = snapshot.maskedValue || (snapshot.value ? maskDestinationValue(snapshot.value) : null);
      return {
        type: snapshot.type,
        maskedValue: maskedValue ?? '****',
        bankName: snapshot.bankName ?? withdrawal.bankName ?? null,
        ownerNameMasked: maskOwnerName(snapshot.ownerName ?? null),
      };
    }

    if (withdrawal.iban || withdrawal.cardNumber) {
      const raw = withdrawal.iban ?? withdrawal.cardNumber ?? '';
      return {
        type: withdrawal.iban ? PaymentDestinationTypeEnum.IBAN : PaymentDestinationTypeEnum.CARD,
        maskedValue: maskDestinationValue(raw),
        bankName: withdrawal.bankName ?? null,
        ownerNameMasked: null,
      };
    }

    return null;
  }

  static toResponse(withdrawal: WithdrawalWithUser): WithdrawalResponseDto {
    return {
      id: withdrawal.id,
      userId: withdrawal.userId,
      user: toUserSafeDto(withdrawal.user),
      amount: withdrawal.amount.toString(),
      status: withdrawal.status,
      purpose: withdrawal.purpose,
      destination: this.resolveDestination(withdrawal),
      bankName: withdrawal.bankName,
      iban: withdrawal.iban ? maskDestinationValue(withdrawal.iban) : null,
      cardNumber: withdrawal.cardNumber ? maskDestinationValue(withdrawal.cardNumber) : null,
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
