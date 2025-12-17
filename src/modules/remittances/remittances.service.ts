import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AccountTxType,
  Instrument,
  Remittance,
  RemittanceChannel,
  RemittanceGroup,
  RemittanceGroupStatus,
  RemittanceGroupKind,
  RemittanceStatus,
  TxRefType,
  User,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CreateRemittanceDto } from './dto/create-remittance.dto';
import { RemittanceResponseDto } from './dto/remittance-response.dto';
import { InsufficientCreditException } from '../../common/exceptions/insufficient-credit.exception';
import {
  CreateMultiLegRemittanceDto,
  RemittanceLegInputDto,
  RemittanceLegSettlementInputDto,
} from './dto/create-multi-leg-remittance.dto';
import { RemittanceGroupResponseDto } from './dto/remittance-group-response.dto';
import {
  RemittanceDetailsResponseDto,
  RemittanceSettlementEdgeDto,
} from './dto/remittance-details-response.dto';
import { OpenRemittanceSummaryDto } from './dto/open-remittance-summary.dto';
import { TahesabRemittancesService } from '../tahesab/tahesab-remittances.service';

@Injectable()
export class RemittancesService {
  private readonly logger = new Logger(RemittancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly tahesabRemittances: TahesabRemittancesService,
  ) { }

  async createForUser(fromUserId: string, dto: CreateRemittanceDto): Promise<RemittanceResponseDto> {
    const { legs } = await this.createGroupInternal(
      fromUserId,
      [
        {
          toMobile: dto.toMobile,
          instrumentCode: dto.instrumentCode,
          amount: dto.amount,
          note: dto.note,
        },
      ],
      dto.note,
    );

    const leg = legs[0];

    return this.mapRemittanceToDto({ ...leg, group: leg.group });
  }

  async createGroupForUser(
    fromUserId: string,
    dto: CreateMultiLegRemittanceDto,
  ): Promise<RemittanceGroupResponseDto> {
    const { group, legs } = await this.createGroupInternal(
      fromUserId,
      dto.legs,
      dto.groupNote,
      dto.kind,
    );
  
    // 🛠️ اصلاح: آبجکت group را با فیلد legs ادغام کنید
    // سپس آن را به mapGroupToDto پاس دهید
    return this.mapGroupToDto({
      ...group, // تمام پراپرتی‌های RemittanceGroup
      legs: legs, // اضافه کردن پراپرتی legs
    });
  }

  async findByUser(userId: string): Promise<RemittanceResponseDto[]> {
    const remittances = await this.prisma.remittance.findMany({
      where: {
        OR: [
          { fromUserId: userId },
          { toUserId: userId },
        ],
      },
      include: {
        instrument: true,
        toUser: true,
        group: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return remittances.map((remittance) => this.mapRemittanceToDto(remittance));
  }

  async findGroupsByUser(userId: string): Promise<RemittanceGroupResponseDto[]> {
    const groups = await this.prisma.remittanceGroup.findMany({
      where: {
        OR: [
          { createdByUserId: userId },
          { legs: { some: { fromUserId: userId } } },
          { legs: { some: { toUserId: userId } } },
        ],
      },
      include: {
        legs: {
          include: {
            toUser: true,
            instrument: true,
            group: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return groups.map((group) => this.mapGroupToDto(group));
  }

  async findOneWithSettlementsForUser(
    remittanceId: string,
    userId: string,
  ): Promise<RemittanceDetailsResponseDto> {
    const remittance = await this.prisma.remittance.findUnique({
      where: { id: remittanceId },
      include: {
        instrument: true,
        toUser: true,
        fromUser: true,
        group: true,
        settlementsAsLeg: {
          include: {
            sourceRemittance: {
              include: {
                instrument: true,
                fromUser: true,
                toUser: true,
              },
            },
          },
        },
        settlementsAsSource: {
          include: {
            leg: {
              include: {
                instrument: true,
                fromUser: true,
                toUser: true,
                group: true,
              },
            },
          },
        },
      },
    });

    if (!remittance) {
      throw new NotFoundException('Remittance not found');
    }

    if (
      remittance.fromUserId !== userId &&
      remittance.toUserId !== userId &&
      remittance.onBehalfOfUserId !== userId &&
      remittance.group?.createdByUserId !== userId
    ) {
      throw new NotFoundException('Remittance not found');
    }

    const base: RemittanceDetailsResponseDto = {
      ...this.mapRemittanceToDto(remittance),
      settles: [],
      settledBy: [],
    };

    const settles: RemittanceSettlementEdgeDto[] = remittance.settlementsAsLeg.map((link) => {
      const source = link.sourceRemittance;
      return {
        remittanceId: source.id,
        amount: link.amount.toString(),
        instrumentCode: source.instrument.code,
        status: source.status,
        fromUserId: source.fromUserId,
        fromMobile: source.fromUser.mobile,
        toUserId: source.toUserId,
        toMobile: source.toUser.mobile,
        note: link.note ?? undefined,
        createdAt: link.createdAt,
      };
    });

    const settledBy: RemittanceSettlementEdgeDto[] = remittance.settlementsAsSource.map((link) => {
      const leg = link.leg;
      return {
        remittanceId: leg.id,
        amount: link.amount.toString(),
        instrumentCode: leg.instrument.code,
        status: leg.status,
        fromUserId: leg.fromUserId,
        fromMobile: leg.fromUser.mobile,
        toUserId: leg.toUserId,
        toMobile: leg.toUser.mobile,
        note: link.note ?? undefined,
        createdAt: link.createdAt,
      };
    });

    base.settles = settles;
    base.settledBy = settledBy;

    return base;
  }

  async findOpenObligationsForUser(userId: string): Promise<OpenRemittanceSummaryDto[]> {
    const remittances = await this.prisma.remittance.findMany({
      where: {
        status: {
          in: [RemittanceStatus.PENDING, RemittanceStatus.PARTIAL],
        },
        OR: [{ toUserId: userId }, { fromUserId: userId }, { onBehalfOfUserId: userId }],
      },
      include: {
        instrument: true,
        fromUser: true,
        toUser: true,
        group: true,
        settlementsAsSource: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const result: OpenRemittanceSummaryDto[] = [];

    for (const remittance of remittances) {
      const settledAmount = remittance.settlementsAsSource.reduce(
        (acc, link) => acc.add(link.amount),
        new Decimal(0),
      );
      const originalAmount = new Decimal(remittance.amount);
      const remainingAmount = originalAmount.minus(settledAmount);

      if (remainingAmount.lte(0)) {
        continue;
      }

      let direction: 'INCOMING' | 'OUTGOING' | 'ON_BEHALF';
      let counterpartyUserId: string;
      let counterpartyMobile: string;

      if (remittance.onBehalfOfUserId && remittance.onBehalfOfUserId === userId) {
        direction = 'ON_BEHALF';
        counterpartyUserId = remittance.toUserId;
        counterpartyMobile = remittance.toUser.mobile;
      } else if (remittance.toUserId === userId) {
        direction = 'INCOMING';
        counterpartyUserId = remittance.fromUserId;
        counterpartyMobile = remittance.fromUser.mobile;
      } else {
        direction = 'OUTGOING';
        counterpartyUserId = remittance.toUserId;
        counterpartyMobile = remittance.toUser.mobile;
      }

      result.push({
        id: remittance.id,
        instrumentCode: remittance.instrument.code,
        originalAmount: originalAmount.toString(),
        settledAmount: settledAmount.toString(),
        remainingAmount: remainingAmount.toString(),
        status: remittance.status,
        direction,
        counterpartyUserId,
        counterpartyMobile,
        onBehalfOfUserId: remittance.onBehalfOfUserId ?? undefined,
        note: remittance.note ?? undefined,
        createdAt: remittance.createdAt,
        groupId: remittance.groupId ?? undefined,
        groupKind: remittance.group?.kind,
      });
    }

    return result;
  }

  private mapRemittanceToDto(
    remittance: Remittance & {
      instrument: Instrument;
      toUser: User;
      group?: RemittanceGroup | null;
    },
  ): RemittanceResponseDto {
    return {
      id: remittance.id,
      fromUserId: remittance.fromUserId,
      toUserId: remittance.toUserId,
      toMobile: remittance.toUser.mobile,
      instrumentCode: remittance.instrument.code,
      amount: remittance.amount.toString(),
      note: remittance.note ?? undefined,
      createdAt: remittance.createdAt,
      status: remittance.status,
      onBehalfOfUserId: remittance.onBehalfOfUserId ?? undefined,
      channel: remittance.channel,
      iban: remittance.iban ?? undefined,
      cardLast4: remittance.cardLast4 ?? undefined,
      externalPaymentRef: remittance.externalPaymentRef ?? undefined,
      groupId: remittance.groupId ?? undefined,
      groupKind: remittance.group?.kind,
      groupStatus: remittance.group?.status,
      tahesabDocId: remittance.tahesabDocId ?? undefined,
    };
  }

  private mapGroupToDto(
    group: RemittanceGroup & { legs: (Remittance & { toUser: User; instrument: Instrument })[] },
  ): RemittanceGroupResponseDto {
    return {
      id: group.id,
      createdByUserId: group.createdByUserId,
      note: group.note ?? undefined,
      status: group.status,
      createdAt: group.createdAt,
      legs: group.legs.map((leg) =>
        this.mapRemittanceToDto({
          ...leg,
          group: group, // 👈 اصلاح شده: آبجکت گروه را به سادگی به عنوان فیلد group اضافه کنید
        })
      ),
    };
  }

  private async createGroupInternal(
    fromUserId: string,
    legsInput: RemittanceLegInputDto[],
    groupNote?: string,
    explicitKind?: string,
  ): Promise<{
    group: RemittanceGroup;
    legs: (Remittance & {
      toUser: User;
      fromUser: User;
      instrument: Instrument;
      group?: RemittanceGroup | null;
    })[];
  }> {
    if (!legsInput.length) {
      throw new BadRequestException('At least one leg is required');
    }

    const parsedLegs = legsInput.map((leg, index) => ({
      input: leg,
      amount: new Decimal(leg.amount),
      index,
    }));
    for (const { amount } of parsedLegs) {
      if (amount.lte(0)) {
        throw new BadRequestException('Amount must be positive');
      }
    }

    const uniqueMobiles = Array.from(new Set(legsInput.map((l) => l.toMobile)));
    const users = await this.prisma.user.findMany({ where: { mobile: { in: uniqueMobiles } } });
    const usersByMobile = new Map(users.map((u) => [u.mobile, u] as const));

    for (const mobile of uniqueMobiles) {
      if (!usersByMobile.has(mobile)) {
        throw new NotFoundException(`Destination user with mobile ${mobile} not found`);
      }
    }

    const onBehalfMobiles = legsInput
      .map((l) => l.onBehalfOfMobile)
      .filter((m): m is string => Boolean(m));
    const uniqueOnBehalfMobiles = Array.from(new Set(onBehalfMobiles));
    let onBehalfUsersByMobile = new Map<string, User>();
    if (uniqueOnBehalfMobiles.length) {
      const onBehalfUsers = await this.prisma.user.findMany({
        where: { mobile: { in: uniqueOnBehalfMobiles } },
      });
      onBehalfUsersByMobile = new Map(onBehalfUsers.map((u) => [u.mobile, u] as const));
      for (const mobile of uniqueOnBehalfMobiles) {
        if (!onBehalfUsersByMobile.has(mobile)) {
          throw new NotFoundException(`On-behalf-of user not found for mobile: ${mobile}`);
        }
      }
    }

    const uniqueInstrumentCodes = Array.from(new Set(legsInput.map((l) => l.instrumentCode)));
    const instruments = await this.prisma.instrument.findMany({ where: { code: { in: uniqueInstrumentCodes } } });
    const instrumentsByCode = new Map(instruments.map((i) => [i.code, i] as const));

    for (const code of uniqueInstrumentCodes) {
      if (!instrumentsByCode.has(code)) {
        throw new NotFoundException(`Instrument ${code} not found`);
      }
    }

    for (const leg of legsInput) {
      const toUser = usersByMobile.get(leg.toMobile)!;
      if (toUser.id === fromUserId) {
        throw new BadRequestException('Cannot transfer to self');
      }
    }

    let kind: RemittanceGroupKind;
    if (explicitKind) {
      if (!Object.values(RemittanceGroupKind).includes(explicitKind as RemittanceGroupKind)) {
        throw new BadRequestException('Invalid remittance group kind');
      }
      kind = explicitKind as RemittanceGroupKind;
    } else if (legsInput.some((l) => l.settlements && l.settlements.length > 0)) {
      kind = RemittanceGroupKind.SETTLEMENT;
    } else if (legsInput.some((l) => l.onBehalfOfMobile)) {
      kind = RemittanceGroupKind.PASS_THROUGH;
    } else {
      kind = RemittanceGroupKind.TRANSFER;
    }

    const totalsByInstrument = new Map<string, Decimal>();
    parsedLegs.forEach(({ input, amount }) => {
      const existing = totalsByInstrument.get(input.instrumentCode) ?? new Decimal(0);
      totalsByInstrument.set(input.instrumentCode, existing.add(amount));
    });

    let settlementCount = 0;
    const { group, legs } = await this.prisma.$transaction(async (tx) => {
      const groupRecord = await tx.remittanceGroup.create({
        data: {
          createdByUserId: fromUserId,
          note: groupNote,
          kind,
        },
      });

      const fromAccounts = new Map<string, Awaited<ReturnType<typeof this.accountsService.getOrCreateAccount>>>();
      for (const code of uniqueInstrumentCodes) {
        const account = await this.accountsService.getOrCreateAccount(fromUserId, code, tx);
        fromAccounts.set(code, account);

        const totalForInstrument = totalsByInstrument.get(code)!;
        const usable = new Decimal(account.balance).minus(account.minBalance);
        if (usable.lt(totalForInstrument)) {
          throw new InsufficientCreditException('Insufficient balance for remittance');
        }
      }

      const legsCreated: Remittance[] = [];
      for (const { input: leg, amount } of parsedLegs) {
        const toUser = usersByMobile.get(leg.toMobile)!;
        const instrument = instrumentsByCode.get(leg.instrumentCode)!;
        const fromAccount = fromAccounts.get(instrument.code)!;
        const toAccount = await this.accountsService.getOrCreateAccount(toUser.id, instrument.code, tx);

        const onBehalfUser = leg.onBehalfOfMobile
          ? onBehalfUsersByMobile.get(leg.onBehalfOfMobile)
          : undefined;

        if (leg.channel && !Object.values(RemittanceChannel).includes(leg.channel as RemittanceChannel)) {
          throw new BadRequestException('Invalid remittance channel');
        }
        const channel: RemittanceChannel = (leg.channel as RemittanceChannel) || RemittanceChannel.INTERNAL;

        const remittanceRecord = await tx.remittance.create({
          data: {
            groupId: groupRecord.id,
            fromUserId,
            toUserId: toUser.id,
            onBehalfOfUserId: onBehalfUser?.id,
            instrumentId: instrument.id,
            amount,
            note: leg.note,
            channel,
            iban: leg.iban,
            cardLast4: leg.cardLast4,
            externalPaymentRef: leg.externalPaymentRef,
            status: RemittanceStatus.PENDING,
          },
        });

        const fromTx = await this.accountsService.applyTransaction(
          tx,
          fromAccount,
          amount.negated(),
          AccountTxType.REMITTANCE,
          TxRefType.REMITTANCE,
          remittanceRecord.id,
          fromUserId,
        );

        const toTx = await this.accountsService.applyTransaction(
          tx,
          toAccount,
          amount,
          AccountTxType.REMITTANCE,
          TxRefType.REMITTANCE,
          remittanceRecord.id,
          fromUserId,
        );

        const updatedLeg = await tx.remittance.update({
          where: { id: remittanceRecord.id },
          data: {
            fromAccountTxId: fromTx.txRecord.id,
            toAccountTxId: toTx.txRecord.id,
            status: RemittanceStatus.COMPLETED,
          },
        });

        legsCreated.push(updatedLeg);
      }

      const allSettlementInputs: { leg: Remittance; input: RemittanceLegSettlementInputDto }[] = [];
      legsCreated.forEach((leg, idx) => {
        const legInput = legsInput[idx];
        if (legInput.settlements && legInput.settlements.length > 0) {
          for (const settlement of legInput.settlements) {
            allSettlementInputs.push({ leg, input: settlement });
          }
        }
      });
      settlementCount = allSettlementInputs.length;

      if (allSettlementInputs.length) {
        const sourceIds = Array.from(new Set(allSettlementInputs.map((s) => s.input.remittanceId)));
        const sourceRemittances = await tx.remittance.findMany({
          where: { id: { in: sourceIds } },
          include: {
            instrument: true,
            settlementsAsSource: true,
          },
        });
        const sourceById = new Map(sourceRemittances.map((r) => [r.id, r] as const));

        for (const sourceId of sourceIds) {
          if (!sourceById.has(sourceId)) {
            throw new NotFoundException(`Source remittance not found: ${sourceId}`);
          }
        }

        const sourceSettledTotals = new Map<string, Decimal>();
        for (const source of sourceRemittances) {
          const totalSettledBefore = source.settlementsAsSource.reduce(
            (acc, link) => acc.add(link.amount),
            new Decimal(0),
          );
          sourceSettledTotals.set(source.id, totalSettledBefore);
        }

        const settlementTotalsByLegId = new Map<string, Decimal>();

        for (const { leg, input } of allSettlementInputs) {
          const settlementAmount = new Decimal(input.amount);
          if (settlementAmount.lte(0)) {
            throw new BadRequestException('Settlement amount must be positive');
          }
          const source = sourceById.get(input.remittanceId)!;
          if (source.instrumentId !== leg.instrumentId) {
            throw new BadRequestException('Settlement instrument mismatch');
          }

          const currentLegTotal = settlementTotalsByLegId.get(leg.id) ?? new Decimal(0);
          const newLegTotal = currentLegTotal.add(settlementAmount);
          if (newLegTotal.gt(leg.amount)) {
            throw new BadRequestException(`Settlement amount exceeds leg amount for leg ${leg.id}`);
          }
          settlementTotalsByLegId.set(leg.id, newLegTotal);

          const currentSettled = sourceSettledTotals.get(source.id) ?? new Decimal(0);
          const sourceRemainingBefore = new Decimal(source.amount).minus(currentSettled);
          if (sourceRemainingBefore.lte(0)) {
            throw new BadRequestException(`Remittance ${source.id} is already fully settled`);
          }
          if (sourceRemainingBefore.lt(settlementAmount)) {
            throw new BadRequestException(
              `Settlement amount exceeds remaining balance of remittance ${source.id}`,
            );
          }

          const updatedSettled = currentSettled.add(settlementAmount);
          sourceSettledTotals.set(source.id, updatedSettled);

          await tx.remittanceSettlementLink.create({
            data: {
              legId: leg.id,
              sourceRemittanceId: source.id,
              amount: settlementAmount,
              note: input.note,
            },
          });

          const sourceStatus = updatedSettled.eq(new Decimal(source.amount))
            ? RemittanceStatus.COMPLETED
            : RemittanceStatus.PARTIAL;
          await tx.remittance.update({
            where: { id: source.id },
            data: { status: sourceStatus },
          });
        }
      }

      const closedGroup = await tx.remittanceGroup.update({
        where: { id: groupRecord.id },
        data: {
          status: RemittanceGroupStatus.CLOSED,
        },
      });

      const legsWithRelations = await tx.remittance.findMany({
        where: { id: { in: legsCreated.map((l) => l.id) } },
        include: {
          fromUser: true,
          toUser: true,
          instrument: true,
          group: true,
          settlementsAsLeg: true,
        },
      });

      return { group: closedGroup, legs: legsWithRelations };
    });

    this.logger.log(
      `Remittance group ${group.id} created by ${fromUserId} with ${legs.length} legs; settlements: ${settlementCount}`,
    );

    for (const leg of legs) {
      await this.tahesabRemittances.enqueueRemittanceLeg(leg as Remittance & {
        toUser: User;
        fromUser: User;
        instrument: Instrument;
        group?: RemittanceGroup | null;
      });
    }

    return { group, legs };
  }
}
