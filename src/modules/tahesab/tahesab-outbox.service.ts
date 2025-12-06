import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TahesabOutboxAction,
  TahesabOutboxPayloadMap,
  TahesabDocumentResult,
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

  private extractFactorCode(result: unknown): string | null {
    if (!result) return null;
    const documentResult = result as TahesabDocumentResult & { factorCode?: string };
    return documentResult.Sh_factor ?? documentResult.factorCode ?? null;
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
      case 'DoDeleteSanad':
        return this.documents.deleteDocument(
          payload as TahesabOutboxPayloadMap['DoDeleteSanad'],
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
        const result = await this.dispatch(action, payload);
        const factorCode = this.extractFactorCode(result);
        await this.prisma.$transaction(async (tx) => {
          await tx.tahesabOutbox.update({
            where: { id: item.id },
            data: { status: 'SUCCESS', lastError: null, tahesabFactorCode: factorCode },
          });

          if (item.correlationId && factorCode) {
            const remittance = await tx.remittance.findUnique({
              where: { id: item.correlationId },
            });
            if (remittance) {
              await tx.remittance.update({
                where: { id: remittance.id },
                data: { tahesabDocId: remittance.tahesabDocId ?? factorCode },
              });
              if (remittance.groupId) {
                await tx.remittanceGroup.updateMany({
                  where: { id: remittance.groupId, tahesabDocId: null },
                  data: { tahesabDocId: factorCode },
                });
              }
            }
          }
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
