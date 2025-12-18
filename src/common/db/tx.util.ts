import { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export interface RunInTxOptions {
  timeout?: number;
  maxWait?: number;
  maxAttempts?: number;
  backoffMs?: number;
  logger?: Logger;
}

const defaultTimeoutMs = Number(process.env.PRISMA_TX_TIMEOUT_MS ?? 20_000);
const defaultMaxWaitMs = Number(process.env.PRISMA_TX_MAX_WAIT_MS ?? 10_000);

function isTransientPrismaError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ['P2034', 'P2033', 'P2028'].includes(error.code);
  }

  const message = typeof (error as { message?: string }).message === 'string'
    ? (error as { message: string }).message.toLowerCase()
    : '';

  return (
    message.includes('deadlock') ||
    message.includes('serialization failure') ||
    message.includes('could not serialize') ||
    message.includes('already closed') ||
    message.includes('timeout')
  );
}

function getErrorCode(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runInTx<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: RunInTxOptions = {},
): Promise<T> {
  const attempts = options.maxAttempts ?? 3;
  const baseDelay = options.backoffMs ?? 100;
  const timeout = options.timeout ?? defaultTimeoutMs;
  const maxWait = options.maxWait ?? defaultMaxWaitMs;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await prisma.$transaction(fn, { timeout, maxWait });
    } catch (error) {
      const shouldRetry = isTransientPrismaError(error);
      if (!shouldRetry || attempt === attempts) {
        throw error;
      }

      const delay = baseDelay * 2 ** (attempt - 1);
      options.logger?.warn(
        `Transient transaction failure; retrying attempt ${attempt + 1}/${attempts} after ${delay}ms`,
        {
          attempt,
          delayMs: delay,
          errorCode: getErrorCode(error),
        },
      );
      await sleep(delay);
    }
  }

  throw new Error('Exhausted transaction retries');
}
