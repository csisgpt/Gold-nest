import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

const SENSITIVE_KEYS = new Set(['password', 'refreshToken', 'otp']);

function stripSensitive(value: any, seen = new WeakSet<object>()): any {
  // IMPORTANT: do not touch streams/files
  if (value instanceof StreamableFile) return value;
  if (Buffer.isBuffer(value)) return value;

  if (value && typeof value === 'object') {
    if (seen.has(value)) return value; // prevent circular traversal
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((v) => stripSensitive(v, seen));
    }

    return Object.entries(value).reduce<Record<string, any>>((acc, [key, val]) => {
      if (SENSITIVE_KEYS.has(key)) return acc;
      acc[key] = stripSensitive(val, seen);
      return acc;
    }, {});
  }

  return value;
}

@Injectable()
export class SensitiveFieldsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => stripSensitive(data)));
  }
}
