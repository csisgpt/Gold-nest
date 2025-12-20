import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class FileUploadInterceptor implements NestInterceptor {
  constructor(private readonly configService: ConfigService) {}

  private buildOptions() {
    const maxSizeRaw = this.configService.get<string>('FILE_MAX_SIZE_BYTES');
    const parsedMaxSize = maxSizeRaw ? Number(maxSizeRaw) : Number.NaN;
    const maxSize = Number.isFinite(parsedMaxSize)
      ? parsedMaxSize
      : 5_000_000;

    const allowedRaw =
      this.configService.get<string>('FILE_ALLOWED_MIME') ||
      'image/jpeg,image/png,application/pdf';
    const allowed = allowedRaw
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    return {
      limits: { fileSize: maxSize },
      fileFilter: (_req: Request, file: Express.Multer.File, cb: any) => {
        if (allowed.length > 0 && !allowed.includes(file.mimetype)) {
          return cb(new BadRequestException('MIME type not allowed'), false);
        }
        cb(null, true);
      },
    };
  }

  intercept(context: ExecutionContext, next: CallHandler) {
    const interceptor = new (FileInterceptor('file', this.buildOptions()))();
    return interceptor.intercept(context, next);
  }
}
