import { Injectable } from '@nestjs/common';
import { AccountTxType, AttachmentEntityType, GoldLotStatus, TxRefType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { FilesService } from '../files/files.service';
import { GOLD_750_INSTRUMENT_CODE, HOUSE_USER_ID } from '../accounts/constants';
import { CreateGoldLotDto } from './dto/create-gold-lot.dto';
import { InstrumentsService } from '../instruments/instruments.service';
import { runInTx } from '../../common/db/tx.util';

@Injectable()
export class GoldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly filesService: FilesService,
    private readonly instrumentsService: InstrumentsService,
  ) {}

  async createLot(dto: CreateGoldLotDto) {
    const grossWeight = new Decimal(dto.grossWeight);
    const equivGram750 = grossWeight.mul(dto.karat).div(1000).div(0.75);

    // Ensure gold instrument exists so ledger posting works
    await this.instrumentsService.findByCode(GOLD_750_INSTRUMENT_CODE);

    return runInTx(this.prisma, async (tx) => {
      const lot = await tx.goldLot.create({
        data: {
          userId: dto.userId,
          grossWeight,
          karat: dto.karat,
          equivGram750,
          note: dto.note,
          status: GoldLotStatus.IN_VAULT,
        },
      });

      await this.filesService.createAttachments(
        dto.fileIds,
        AttachmentEntityType.GOLD_LOT,
        lot.id,
        tx,
      );

      // Ledger reflects custody: both client and house increase their gold positions.
      const userGold = await this.accountsService.getOrCreateAccount(
        dto.userId,
        GOLD_750_INSTRUMENT_CODE,
        tx,
      );
      const houseGold = await this.accountsService.getOrCreateAccount(
        HOUSE_USER_ID,
        GOLD_750_INSTRUMENT_CODE,
        tx,
      );

      await this.accountsService.lockAccounts(tx, [userGold.id, houseGold.id]);

      await this.accountsService.applyTransaction(
        {
          accountId: userGold.id,
          delta: equivGram750,
          type: AccountTxType.ADJUSTMENT,
          refType: TxRefType.GOLD_LOT,
          refId: lot.id,
        },
        tx,
      );

      await this.accountsService.applyTransaction(
        {
          accountId: houseGold.id,
          delta: equivGram750,
          type: AccountTxType.ADJUSTMENT,
          refType: TxRefType.GOLD_LOT,
          refId: lot.id,
        },
        tx,
      );

      return lot;
    });
  }

  findByUser(userId: string) {
    return this.prisma.goldLot.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
