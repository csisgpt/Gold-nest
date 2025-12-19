import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse, nowIso } from './api-response';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown | ApiResponse<unknown>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<{ headers: Record<string, string>; traceId?: string }>();
    const shouldEnvelope = request.headers?.['x-api-envelope'] === '1';

    if (!shouldEnvelope) {
      return next.handle();
    }

    const traceId = request.traceId ?? '';

    return next.handle().pipe(
      map((data) => ({
        ok: true,
        result: data,
        meta: undefined,
        error: null,
        traceId,
        ts: nowIso(),
      })),
    );
  }
}
