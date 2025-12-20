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
import { SKIP_RESPONSE_WRAP_KEY } from '../decorators/skip-wrap.decorator';
import { ApiResponse, nowIso } from './api-response';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown | ApiResponse<unknown>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<{ headers: Record<string, string>; traceId?: string }>();
    const shouldEnvelope = request.headers?.['x-api-envelope'] === '1';
    const skipWrap = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!shouldEnvelope || skipWrap) {
      return next.handle();
    }

    const traceId = request.traceId ?? '';

    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile || Buffer.isBuffer(data)) {
          return data;
        }

        return {
          ok: true,
          result: data,
          meta: undefined,
          error: null,
          traceId,
          ts: nowIso(),
        } satisfies ApiResponse<unknown>;
      }),
    );
  }
}
