import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { traceId?: string }, res: Response, next: NextFunction): void {
    const incomingId = req.header('X-Request-Id') ?? req.header('X-Trace-Id');
    const traceId = incomingId && incomingId.trim().length > 0 ? incomingId : `req_${randomUUID()}`;

    req.traceId = traceId;
    res.locals.traceId = traceId;
    res.setHeader('X-Request-Id', traceId);
    res.setHeader('X-Trace-Id', traceId);

    next();
  }
}
