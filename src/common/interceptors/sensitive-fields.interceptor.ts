import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

const SENSITIVE_KEYS = new Set(['password', 'refreshToken', 'otp']);

function stripSensitive(value: any): any {
  if (Array.isArray(value)) {
    return value.map(stripSensitive);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce<Record<string, any>>((acc, [key, val]) => {
      if (SENSITIVE_KEYS.has(key)) {
        return acc;
      }
      acc[key] = stripSensitive(val);
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
