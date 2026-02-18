// src/common/interceptors/sensitive-fields.interceptor.ts
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

function isPlainObject(value: any): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function stripSensitive(value: any, seen: WeakSet<object>): any {
  if (value instanceof StreamableFile || Buffer.isBuffer(value) || value instanceof Readable) {
    return value;
  }

  // ✅ خیلی مهم: Date را plain object فرض نکن
  if (value instanceof Date) {
    return value; // JSON.stringify خودش => ISO
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    return value.map((v) => stripSensitive(v, seen));
  }

  // ✅ فقط plain object
  if (isPlainObject(value)) {
    if (seen.has(value)) return value;
    seen.add(value);

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
    return next.handle().pipe(map((data) => stripSensitive(data, new WeakSet())));
  }
}
