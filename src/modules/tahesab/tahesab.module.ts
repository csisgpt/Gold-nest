import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Agent } from 'https';
import { TahesabController } from './tahesab.controller';
import { TahesabHttpClient } from './tahesab-http.client';
import { TahesabService } from './tahesab.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const timeoutConfig = configService.get<string | number>('TAHESAB_TIMEOUT');
        const parsedTimeout =
          typeof timeoutConfig === 'string'
            ? Number(timeoutConfig)
            : timeoutConfig;
        const timeout = Number.isFinite(parsedTimeout)
          ? (parsedTimeout as number)
          : 10000;
        const baseURL = configService.get<string>('TAHESAB_BASE_URL');
        const rejectUnauthorizedEnv = configService.get<string>(
          'TAHESAB_TLS_REJECT_UNAUTHORIZED',
        );
        const rejectUnauthorized = rejectUnauthorizedEnv === 'false' ? false : true;

        return {
          baseURL,
          timeout,
          httpsAgent: new Agent({ rejectUnauthorized }),
        };
      },
    }),
  ],
  providers: [TahesabHttpClient, TahesabService],
  controllers: [TahesabController],
  exports: [TahesabService],
})
export class TahesabModule {}
