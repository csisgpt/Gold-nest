const {
  SetMetadata,
  applyDecorators,
  TooManyRequestsException,
} = require('@nestjs/common');

const THROTTLER_OPTIONS = 'THROTTLER_OPTIONS';
const THROTTLER_LIMIT = 'THROTTLER_LIMIT';
const THROTTLER_TTL = 'THROTTLER_TTL';

function Throttle(limit, ttl) {
  return applyDecorators(
    SetMetadata(THROTTLER_LIMIT, limit),
    SetMetadata(THROTTLER_TTL, ttl),
  );
}

class ThrottlerModule {
  static forRoot(options) {
    return {
      module: ThrottlerModule,
      providers: [
        { provide: THROTTLER_OPTIONS, useValue: options },
        ThrottlerGuard,
      ],
      exports: [ThrottlerGuard],
    };
  }
}

// @Injectable()
class ThrottlerGuard {
  constructor(options) {
    this.options = options || { ttl: 60, limit: 60 };
    this.storage = new Map();
  }

  canActivate(context) {
    const now = Date.now();
    const request = context.switchToHttp().getRequest?.();
    const handler = context.getHandler();
    const cls = context.getClass();
    const limit =
      Reflect.getMetadata(THROTTLER_LIMIT, handler) ??
      Reflect.getMetadata(THROTTLER_LIMIT, cls) ??
      this.options.limit;
    const ttl =
      Reflect.getMetadata(THROTTLER_TTL, handler) ??
      Reflect.getMetadata(THROTTLER_TTL, cls) ??
      this.options.ttl;

    const identifier = `${request?.ip ?? 'unknown'}:${cls?.name ?? 'Unknown'}:${handler?.name ?? 'handler'}`;
    const record = this.storage.get(identifier);

    if (!record || record.resetAt < now) {
      this.storage.set(identifier, { count: 1, resetAt: now + ttl * 1000 });
      return true;
    }

    if (record.count >= limit) {
      throw new TooManyRequestsException('Too many requests');
    }

    record.count += 1;
    return true;
  }
}

module.exports = {
  Throttle,
  ThrottlerGuard,
  ThrottlerModule,
  THROTTLER_OPTIONS,
};
