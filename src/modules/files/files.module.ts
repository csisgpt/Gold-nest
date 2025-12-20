import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { PrismaModule } from '../prisma/prisma.module';
import {
  STORAGE_PROVIDER,
} from './storage/storage.provider';
import { LocalStorageProvider } from './storage/local.storage';
import { FileUploadInterceptor } from './file-upload.interceptor';
  
@Module({
  imports: [PrismaModule, ConfigModule],
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
            throw new Error('LIARA_BUCKET_NAME is required for S3 storage');
          }

          return new S3StorageProvider(bucket, {
            endpoint: configService.get<string>('LIARA_ENDPOINT'),
            region: configService.get<string>('LIARA_REGION') || 'default',
            accessKeyId: configService.get<string>('LIARA_ACCESS_KEY'),
            secretAccessKey: configService.get<string>('LIARA_SECRET_KEY'),
          });
        }

        const uploadRoot = configService.get<string>('UPLOAD_ROOT') || 'uploads';
        return new LocalStorageProvider(uploadRoot);
      },
      inject: [ConfigService],
    },
  ],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}
