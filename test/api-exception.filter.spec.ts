import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { ApiExceptionFilter } from '../src/common/http/api-exception.filter';

function createHostCapture() {
  const captured: any[] = [];
  const response = {
    status: (code: number) => ({
      json: (payload: unknown) => captured.push({ status: code, payload }),
    }),
  };

  const http = {
    getResponse: () => response,
    getRequest: () => ({ traceId: 'trace-test' }),
  };

  const host = {
    switchToHttp: () => http,
  } as any;

  return { host, captured };
}

test('ApiExceptionFilter preserves custom http exception codes', () => {
  const filter = new ApiExceptionFilter();
  const { host, captured } = createHostCapture();

  const exception = new ForbiddenException({
    code: 'USER_TRADE_DISABLED',
    message: 'Trading disabled',
  });

  filter.catch(exception, host);

  assert.strictEqual(captured.length, 1);
  const { payload } = captured[0];
  assert.strictEqual(payload.error.code, 'USER_TRADE_DISABLED');
  assert.strictEqual(payload.error.message, 'Trading disabled');
  assert.strictEqual(payload.traceId, 'trace-test');
});
