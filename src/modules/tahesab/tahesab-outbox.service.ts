import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async enqueue<A extends TahesabOutboxAction>(
    method: A,
    dto: TahesabOutboxPayloadMap[A],
    options?: { correlationId?: string },
  ): Promise<void> {
    await this.prisma.tahesabOutbox.create({
      data: {
        method,
        payload: dto as Prisma.JsonValue,
        correlationId: options?.correlationId,
      },
    });
  }

  async enqueueOnce<A extends TahesabOutboxAction>(
    method: A,
    dto: TahesabOutboxPayloadMap[A],
    options: { correlationId: string },
  ): Promise<void> {
    const existing = await this.prisma.tahesabOutbox.findFirst({
      where: { method, correlationId: options.correlationId },
    });

    if (existing) {
      this.logger.debug(
        `Tahesab outbox already contains ${method} with correlationId=${options.correlationId}`,
      );
      return;
    }

    await this.enqueue(method, dto, options);
  }

  private async dispatch(
    action: TahesabOutboxAction,
    payload: TahesabOutboxPayloadMap[TahesabOutboxAction],
  ) {
    switch (action) {
      case 'DoNewMoshtari':
        return this.accounts.createCustomer(
          payload as TahesabOutboxPayloadMap['DoNewMoshtari'],
        );
      case 'DoEditMoshtari':
        return this.accounts.updateCustomer(
          payload as TahesabOutboxPayloadMap['DoEditMoshtari'],
        );
      case 'DoNewSanadVKHGOLD':
        return this.documents.createGoldInOut(
          payload as TahesabOutboxPayloadMap['DoNewSanadVKHGOLD'],
        );
      case 'DoNewSanadBuySaleGOLD':
        return this.documents.createGoldBuySell(
          payload as TahesabOutboxPayloadMap['DoNewSanadBuySaleGOLD'],
        );
      case 'DoNewSanadVKHVaghNaghd':
        return this.documents.createCashInOut(
          payload as TahesabOutboxPayloadMap['DoNewSanadVKHVaghNaghd'],
        );
      case 'DoNewSanadVKHBank':
        return this.documents.createBankInOut(
          payload as TahesabOutboxPayloadMap['DoNewSanadVKHBank'],
        );
      case 'DoNewSanadTakhfif':
        return this.documents.createDiscount(
          payload as TahesabOutboxPayloadMap['DoNewSanadTakhfif'],
        );
      case 'DoNewSanadTalabBedehi':
        return this.documents.createTalabBedehi(
          payload as TahesabOutboxPayloadMap['DoNewSanadTalabBedehi'],
        );
      default:
        this.logger.warn(`No dispatcher configured for ${action}`);
        return null;
    }
  }

  async processBatch(limit = 50): Promise<void> {
    const now = new Date();
    const pending = await this.prisma.tahesabOutbox.findMany({
      where: { status: 'PENDING', nextRetryAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    for (const item of pending) {
      try {
        const action = item.method as TahesabOutboxAction;
        const payload = item.payload as TahesabOutboxPayloadMap[TahesabOutboxAction];
        await this.dispatch(action, payload);
        await this.prisma.tahesabOutbox.update({
          where: { id: item.id },
          data: { status: 'SUCCESS', lastError: null },
        });
      } catch (error) {
        const retryCount = item.retryCount + 1;
        const delayMs = Math.min(600000, 1000 * Math.pow(2, retryCount));
        await this.prisma.tahesabOutbox.update({
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
