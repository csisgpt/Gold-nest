import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { P2PAllocationsService } from './p2p-allocations.service';

@Injectable()
export class P2PAllocationExpiryWorker {
  private readonly logger = new Logger(P2PAllocationExpiryWorker.name);

  constructor(private readonly p2pService: P2PAllocationsService) {}

  @Cron('*/5 * * * *')
  async expireAllocations() {
    const processed = await this.p2pService.expireAllocations();
    if (processed > 0) {
      this.logger.log(`Expired ${processed} P2P allocations.`);
    }
  }
}
