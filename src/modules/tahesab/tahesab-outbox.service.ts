import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TahesabOutboxAction,
  TahesabOutboxPayloadMap,
} from './tahesab.methods';
import { TahesabDocumentsService } from './tahesab-documents.service';
import { TahesabAccountsService } from './tahesab-accounts.service';

@Injectable()
export class TahesabOutboxService {
  private readonly logger = new Logger(TahesabOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: TahesabDocumentsService,
    private readonly accounts: TahesabAccountsService,
  ) {}

  // TODO: integrate enqueue calls from domain events (deposit/withdraw/trade approval).

  async enqueue<A extends TahesabOutboxAction>(
    method: A,
    dto: TahesabOutboxPayloadMap[A],
    options?: { correlationId?: string },
  ): Promise<void> {
    const prisma = this.prisma as any;
    await prisma.tahesabOutbox.create({
      data: {
        method,
        payload: dto as any,
        correlationId: options?.correlationId,
      },
    });
  }

  private async dispatch(item: { method: TahesabOutboxAction; payload: any }) {
    switch (item.method) {
      case 'DoNewMoshtari':
        return this.accounts.createCustomer(
          item.payload as TahesabOutboxPayloadMap['DoNewMoshtari'],
        );
      case 'DoEditMoshtari':
        return this.accounts.updateCustomer(
          item.payload as TahesabOutboxPayloadMap['DoEditMoshtari'],
        );
      case 'DoNewSanadVKHGOLD':
        return this.documents.createGoldInOut(
          item.payload as TahesabOutboxPayloadMap['DoNewSanadVKHGOLD'],
        );
      case 'DoNewSanadBuySaleGOLD':
        return this.documents.createGoldBuySell(
          item.payload as TahesabOutboxPayloadMap['DoNewSanadBuySaleGOLD'],
        );
      case 'DoNewSanadVKHVaghNaghd':
        return this.documents.createCashInOut(
          item.payload as TahesabOutboxPayloadMap['DoNewSanadVKHVaghNaghd'],
        );
      case 'DoNewSanadVKHBank':
        return this.documents.createBankInOut(
          item.payload as TahesabOutboxPayloadMap['DoNewSanadVKHBank'],
        );
      case 'DoNewSanadTakhfif':
        return this.documents.createDiscount(
          item.payload as TahesabOutboxPayloadMap['DoNewSanadTakhfif'],
        );
      case 'DoNewSanadTalabBedehi':
        return this.documents.createTalabBedehi(
          item.payload as TahesabOutboxPayloadMap['DoNewSanadTalabBedehi'],
        );
      default:
        this.logger.warn(`No dispatcher configured for ${item.method}`);
        return null;
    }
  }

  async processBatch(limit = 50): Promise<void> {
    const now = new Date();
    const prisma = this.prisma as any;
    const pending = await prisma.tahesabOutbox.findMany({
      where: { status: 'PENDING', nextRetryAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    for (const item of pending) {
      try {
        await this.dispatch(item as any);
        await prisma.tahesabOutbox.update({
          where: { id: item.id },
          data: { status: 'SUCCESS', lastError: null },
        });
      } catch (error) {
        const retryCount = item.retryCount + 1;
        const delayMs = Math.min(600000, 1000 * Math.pow(2, retryCount));
        await prisma.tahesabOutbox.update({
          where: { id: item.id },
          data: {
            status: 'FAILED',
            retryCount,
            lastError: (error as Error).message,
            nextRetryAt: new Date(Date.now() + delayMs),
          },
        });
        this.logger.error(`Failed processing outbox ${item.id}`, (error as Error).stack);
      }
    }
  }
}
