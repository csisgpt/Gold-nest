import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TahesabOutboxService } from './tahesab-outbox.service';

@Injectable()
export class TahesabOutboxProcessor {
  constructor(private readonly outbox: TahesabOutboxService) {}

  @Cron('*/1 * * * *')
  async handleCron() {
    await this.outbox.processBatch(50);
  }
}
