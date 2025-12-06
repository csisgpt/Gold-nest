import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountTxType, Instrument, Remittance, RemittanceGroup, TxRefType, User } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CreateRemittanceDto } from './dto/create-remittance.dto';
import { RemittanceResponseDto } from './dto/remittance-response.dto';
import { InsufficientCreditException } from '../../common/exceptions/insufficient-credit.exception';
import { CreateMultiLegRemittanceDto, RemittanceLegInputDto } from './dto/create-multi-leg-remittance.dto';
import { RemittanceGroupResponseDto } from './dto/remittance-group-response.dto';

@Injectable()
export class RemittancesService {
  private readonly logger = new Logger(RemittancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

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

    return {
      id: leg.id,
      fromUserId: leg.fromUserId,
      toUserId: leg.toUserId,
      toMobile: leg.toUser.mobile,
      instrumentCode: leg.instrument.code,
      amount: leg.amount.toString(),
      note: leg.note ?? undefined,
      createdAt: leg.createdAt,
    };
  }

  async createGroupForUser(
    fromUserId: string,
    dto: CreateMultiLegRemittanceDto,
  ): Promise<RemittanceGroupResponseDto> {
    const { group, legs } = await this.createGroupInternal(fromUserId, dto.legs, dto.groupNote);

    return {
      id: group.id,
      createdByUserId: group.createdByUserId,
      note: group.note ?? undefined,
      status: group.status,
      createdAt: group.createdAt,
      legs: legs.map((leg) => ({
        id: leg.id,
        fromUserId: leg.fromUserId,
        toUserId: leg.toUserId,
        toMobile: leg.toUser.mobile,
        instrumentCode: leg.instrument.code,
        amount: leg.amount.toString(),
        note: leg.note ?? undefined,
        createdAt: leg.createdAt,
      })),
    };
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
      },
      orderBy: { createdAt: 'desc' },
    });

    return remittances.map((remittance) => ({
      id: remittance.id,
      fromUserId: remittance.fromUserId,
      toUserId: remittance.toUserId,
      toMobile: remittance.toUser.mobile,
      instrumentCode: remittance.instrument.code,
      amount: remittance.amount.toString(),
      note: remittance.note ?? undefined,
      createdAt: remittance.createdAt,
    }));
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
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return groups.map((group) => this.mapGroupToDto(group));
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
      legs: group.legs.map((leg) => ({
        id: leg.id,
        fromUserId: leg.fromUserId,
        toUserId: leg.toUserId,
        toMobile: leg.toUser.mobile,
        instrumentCode: leg.instrument.code,
        amount: leg.amount.toString(),
        note: leg.note ?? undefined,
        createdAt: leg.createdAt,
      })),
    };
  }

  private async createGroupInternal(
    fromUserId: string,
    legsInput: RemittanceLegInputDto[],
    groupNote?: string,
  ): Promise<{
    group: RemittanceGroup;
    legs: (Remittance & { toUser: User; instrument: Instrument })[];
  }> {
    if (!legsInput.length) {
      throw new BadRequestException('At least one leg is required');
    }

    const amounts = legsInput.map((leg) => ({ leg, amount: new Decimal(leg.amount) }));
    for (const { amount } of amounts) {
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

    const totalsByInstrument = new Map<string, Decimal>();
    amounts.forEach(({ leg, amount }) => {
      const existing = totalsByInstrument.get(leg.instrumentCode) ?? new Decimal(0);
      totalsByInstrument.set(leg.instrumentCode, existing.add(amount));
    });

    const { group, legs } = await this.prisma.$transaction(async (tx) => {
      const groupRecord = await tx.remittanceGroup.create({
        data: {
          createdByUserId: fromUserId,
          note: groupNote,
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
      for (const { leg, amount } of amounts) {
        const toUser = usersByMobile.get(leg.toMobile)!;
        const instrument = instrumentsByCode.get(leg.instrumentCode)!;
        const fromAccount = fromAccounts.get(instrument.code)!;
        const toAccount = await this.accountsService.getOrCreateAccount(toUser.id, instrument.code, tx);

        const remittanceRecord = await tx.remittance.create({
          data: {
            groupId: groupRecord.id,
            fromUserId,
            toUserId: toUser.id,
            instrumentId: instrument.id,
            amount,
            note: leg.note,
            status: 'PENDING',
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
            status: 'COMPLETED',
          },
        });

        legsCreated.push(updatedLeg);
      }

      const closedGroup = await tx.remittanceGroup.update({
        where: { id: groupRecord.id },
        data: {
          status: 'CLOSED',
        },
      });

      const legsWithRelations = await tx.remittance.findMany({
        where: { id: { in: legsCreated.map((l) => l.id) } },
        include: {
          toUser: true,
          instrument: true,
        },
      });

      return { group: closedGroup, legs: legsWithRelations };
    });

    this.logger.log(`Remittance group ${group.id} created by ${fromUserId} with ${legs.length} legs`);

    return { group, legs };
  }
}
