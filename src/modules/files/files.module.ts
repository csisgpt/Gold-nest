import { InternalServerErrorException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { AdminFilesController } from './admin-files.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PaginationModule } from '../../common/pagination/pagination.module';
import {
  STORAGE_PROVIDER,
} from './storage/storage.provider';
import { LocalStorageProvider } from './storage/local.storage';
import { FileUploadInterceptor } from './file-upload.interceptor';
import { ApiErrorCode } from '../../common/http/api-error-codes';
  
@Module({
  imports: [PrismaModule, ConfigModule, PaginationModule],
  providers: [
    FilesService,
    FileUploadInterceptor,
    {
      provide: STORAGE_PROVIDER,
      useFactory: async (configService: ConfigService) => {
        const driver = (configService.get<string>('STORAGE_DRIVER') || 'local').toLowerCase();
        if (driver === 's3') {
          const { S3StorageProvider } = await import('./storage/s3.storage');
          const bucket = configService.get<string>('LIARA_BUCKET_NAME');
          if (!bucket) {
            throw new InternalServerErrorException({ code: ApiErrorCode.FILE_READ_FAILED, message: 'LIARA_BUCKET_NAME is required for S3 storage' });
          }

          return new S3StorageProvider(bucket, {
            endpoint: configService.get<string>('LIARA_ENDPOINT'),
            region: configService.get<string>('LIARA_REGION') || 'default',
            accessKeyId: configService.get<string>('LIARA_ACCESS_KEY'),
            secretAccessKey: configService.get<string>('LIARA_SECRET_KEY'),
            forcePathStyle:
              (configService.get<string>('S3_FORCE_PATH_STYLE') ?? 'true').toLowerCase() ===
              'true',
          });
        }

        const uploadRoot = configService.get<string>('UPLOAD_ROOT') || 'uploads';
        return new LocalStorageProvider(uploadRoot);
      },
      inject: [ConfigService],
    },
  ],
  controllers: [FilesController, AdminFilesController],
  exports: [FilesService],
})
export class FilesModule {}
