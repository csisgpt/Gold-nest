import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TahesabMethodMap } from './tahesab.methods';
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

  async enqueue<K extends keyof TahesabMethodMap>(
    method: K,
    dto: TahesabMethodMap[K]['args'] | any,
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

  private async dispatch(item: { method: keyof TahesabMethodMap; payload: any }) {
    switch (item.method) {
      case 'DoNewMoshtari':
        return this.accounts.createCustomer(item.payload as any);
      case 'DoEditMoshtari':
        return this.accounts.updateCustomer(item.payload as any);
      case 'DoNewSanadVKHGOLD':
        return this.documents.createGoldInOut(item.payload as any);
      case 'DoNewSanadBuySaleGOLD':
        return this.documents.createGoldBuySell(item.payload as any);
      case 'DoNewSanadVKHVaghNaghd':
        return this.documents.createCashInOut(item.payload as any);
      case 'DoNewSanadVKHBank':
        return this.documents.createBankInOut(item.payload as any);
      case 'DoNewSanadTakhfif':
        return this.documents.createDiscount(item.payload as any);
      case 'DoNewSanadTalabBedehi':
        return this.documents.createTalabBedehi(item.payload as any);
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
