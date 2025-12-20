import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Readable } from 'stream';

const SENSITIVE_KEYS = new Set(['password', 'refreshToken', 'otp']);

function stripSensitive(value: any, seen: WeakSet<object>): any {
  if (value instanceof StreamableFile || Buffer.isBuffer(value) || value instanceof Readable) {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    return value.map((v) => stripSensitive(v, seen));
  }

  if (value && typeof value === 'object') {
    if (seen.has(value)) return value;
    seen.add(value);

    return Object.entries(value).reduce<Record<string, any>>((acc, [key, val]) => {
      if (SENSITIVE_KEYS.has(key)) {
        return acc;
      }
      acc[key] = stripSensitive(val, seen);
      return acc;
    }, {});
  }

  return value;
}

@Injectable()
export class SensitiveFieldsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => stripSensitive(data, new WeakSet())));
  }
}
