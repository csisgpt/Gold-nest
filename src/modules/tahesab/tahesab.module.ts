import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { Agent } from 'https';
import { TahesabController } from './tahesab.controller';
import { TahesabHttpClient } from './tahesab-http.client';
import { TahesabService } from './tahesab.service';
import { TahesabInventoryService } from './tahesab-inventory.service';
import { TahesabAccountsService } from './tahesab-accounts.service';
import { TahesabNamesService } from './tahesab-names.service';
import { TahesabDocumentsService } from './tahesab-documents.service';
import { TahesabEtiketService } from './tahesab-etiket.service';
import { TahesabRfidService } from './tahesab-rfid.service';
import { TahesabDocsReportService } from './tahesab-docs-report.service';
import { TahesabOutboxService } from './tahesab-outbox.service';
import { TahesabOutboxProcessor } from './tahesab-outbox.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { TahesabIntegrationConfigService } from './tahesab-integration.config';
import { TahesabRemittancesService } from './tahesab-remittances.service';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    PrismaModule,
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
  providers: [
    TahesabHttpClient,
    TahesabService,
    TahesabInventoryService,
    TahesabAccountsService,
    TahesabNamesService,
    TahesabDocumentsService,
    TahesabEtiketService,
    TahesabRfidService,
    TahesabDocsReportService,
    TahesabOutboxService,
    TahesabOutboxProcessor,
    TahesabIntegrationConfigService,
    TahesabRemittancesService,
  ],
  controllers: [TahesabController],
  exports: [
    TahesabService,
    TahesabInventoryService,
    TahesabAccountsService,
    TahesabNamesService,
    TahesabDocumentsService,
    TahesabEtiketService,
    TahesabRfidService,
    TahesabDocsReportService,
    TahesabOutboxService,
    TahesabIntegrationConfigService,
    TahesabRemittancesService,
  ],
})
export class TahesabModule {}
