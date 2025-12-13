import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
  meta: {
    requestId?: string;
    timestamp: string;
    path: string;
    method: string;
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const { code, message, details } = this.mapError(status, exception);

    const responseBody: ErrorResponseBody = {
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
      },
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `HTTP ${status} Error on ${request.method} ${request.url}`,
        stack,
        JSON.stringify({ requestId: request.requestId }),
      );
    }

    response.status(status).json(responseBody);
  }

  private mapError(status: number, exception: unknown) {
    let message = 'Internal server error';
    let details: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObject = exceptionResponse as Record<string, unknown>;
        const responseMessage = responseObject.message;
        if (Array.isArray(responseMessage)) {
          message = 'Validation failed';
          details = { errors: responseMessage };
        } else if (typeof responseMessage === 'string') {
          message = responseMessage;
          details = { ...responseObject };
        } else {
          message = exception.message;
          details = { ...responseObject };
        }
      } else {
        message = exception.message;
      }
    }

    const code = this.mapStatusToCode(status);

    return { code, message, details };
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
