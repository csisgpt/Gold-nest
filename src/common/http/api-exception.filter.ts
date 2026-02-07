import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiErrorCode } from './api-error-codes';
import { ApiResponse, ApiFieldError, nowIso } from './api-response';
import { getTraceId } from './trace-id';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest<{ traceId?: string }>();
    const traceId = getTraceId(request, response);

    const { status, errorCode, message, details } = this.resolveException(exception);

    const payload: ApiResponse<null> = {
      ok: false,
      result: null,
      error: {
        code: errorCode,
        message,
        ...(details?.length ? { details } : {}),
      },
      traceId,
      ts: nowIso(),
    };

    response.status(status).json(payload);
  }

  private resolveException(exception: unknown): {
    status: number;
    errorCode: string;
    message: string;
    details?: ApiFieldError[];
  } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaError(exception);
    }

    if (exception instanceof HttpException) {
      return this.mapHttpException(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ApiErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    };
  }

  private mapPrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    errorCode: string;
    message: string;
  } {
    if (exception.code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        errorCode: ApiErrorCode.CONFLICT,
        message: 'Conflict',
      };
    }

    if (exception.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        errorCode: ApiErrorCode.NOT_FOUND,
        message: 'Resource not found',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ApiErrorCode.INTERNAL_ERROR,
      message: exception.message,
    };
  }

  private mapHttpException(exception: HttpException): {
    status: number;
    errorCode: string;
    message: string;
    details?: ApiFieldError[];
  } {
    const status = exception.getStatus();
    const response: unknown = exception.getResponse();
    const { customCode, customMessage } = this.extractCustomHttpException(response);
    const baseMessage = customMessage ?? this.extractMessage(response);

    const errorCode = customCode ?? this.mapStatusToCode(status, exception);

    const details = this.extractValidationDetails(exception, response);

    return {
      status,
      errorCode,
      message: baseMessage,
      ...(details.length ? { details } : {}),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private extractMessage(response: unknown): string {
    if (typeof response === 'string') {
      return response;
    }

    if (this.isRecord(response)) {
      const message = response['message'];

      if (Array.isArray(message) && message.length > 0) {
        return message.map((m) => (typeof m === 'string' ? m : 'Invalid input')).join('; ');
      }

      if (typeof message === 'string') {
        return message;
      }
    }

    return 'Unexpected error';
  }

  private extractCustomHttpException(response: unknown): {
    customCode?: string;
    customMessage?: string;
  } {
    if (!this.isRecord(response)) {
      return {};
    }

    const code = response['code'];
    const message = response['message'];

    const customCode = typeof code === 'string' && code.trim().length ? code.trim() : undefined;
    let customMessage: string | undefined;

    if (typeof message === 'string') {
      customMessage = message;
    } else if (Array.isArray(message) && message.length > 0) {
      customMessage = message.map((m) => (typeof m === 'string' ? m : 'Invalid input')).join('; ');
    }

    return { customCode, customMessage };
  }

  private extractValidationDetails(
    exception: HttpException,
    response: unknown,
  ): ApiFieldError[] {
    if (!(exception instanceof BadRequestException)) {
      return [];
    }

    if (!this.isRecord(response)) {
      return [];
    }

    const details = response['details'];
    if (Array.isArray(details)) {
      return details.filter((item) => this.isRecord(item)).map((item) => ({
        path: typeof item['path'] === 'string' ? item['path'] : '',
        message: typeof item['message'] === 'string' ? item['message'] : 'Invalid input',
      }));
    }

    const message = response['message'];

    if (!Array.isArray(message)) {
      return [];
    }

    return message.map((item) => ({
      path: '',
      message: typeof item === 'string' ? item : 'Invalid input',
    }));
  }


  private mapStatusToCode(status: number, exception: HttpException): ApiErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ApiErrorCode.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ApiErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ApiErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ApiErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ApiErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ApiErrorCode.RATE_LIMITED;
      default:
        if (exception instanceof ForbiddenException) {
          return ApiErrorCode.FORBIDDEN;
        }
        if (exception instanceof UnauthorizedException) {
          return ApiErrorCode.UNAUTHORIZED;
        }
        return ApiErrorCode.INTERNAL_ERROR;
    }
  }
}
