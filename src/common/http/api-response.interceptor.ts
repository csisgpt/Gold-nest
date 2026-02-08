import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Readable } from 'stream';
import { SKIP_RESPONSE_WRAP_KEY } from '../decorators/skip-wrap.decorator';
import { ApiResponse, nowIso } from './api-response';
import { getTraceId } from './trace-id';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown | ApiResponse<unknown>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<{ headers: Record<string, string>; traceId?: string }>();
    const response = httpContext.getResponse();
    const skipWrap = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipWrap || response?.statusCode === 204) {
      return next.handle();
    }

    const traceId = getTraceId(request, response);

    return next.handle().pipe(
      map((data) => {
        const contentType = response?.getHeader?.('content-type');
        if (contentType && typeof contentType === 'string' && !contentType.includes('application/json')) {
          return data;
        }

        if (data instanceof StreamableFile || Buffer.isBuffer(data) || data instanceof Readable) {
          return data;
        }

        if (this.isApiEnvelope(data)) {
          return {
            ...data,
            traceId: data.traceId ?? traceId,
            ts: data.ts ?? nowIso(),
          };
        }

        return {
          ok: true,
          result: data,
          traceId,
          ts: nowIso(),
        } satisfies ApiResponse<unknown>;
      }),
    );
  }

  private isApiEnvelope(value: unknown): value is ApiResponse<unknown> {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const record = value as Record<string, unknown>;
    return typeof record.ok === 'boolean' && ('result' in record || 'error' in record);
  }
}
