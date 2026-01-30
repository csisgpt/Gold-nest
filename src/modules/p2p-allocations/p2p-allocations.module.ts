import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountsModule } from '../accounts/accounts.module';
import { PolicyModule } from '../policy/policy.module';
import { PaginationModule } from '../../common/pagination/pagination.module';
import { PaymentDestinationsModule } from '../payment-destinations/payment-destinations.module';
import { P2PAllocationsService } from './p2p-allocations.service';
import { P2PAllocationsController } from './p2p-allocations.controller';
import { P2PAllocationExpiryWorker } from './p2p-allocations.worker';

@Module({
  imports: [PrismaModule, AccountsModule, PolicyModule, PaginationModule, PaymentDestinationsModule],
  providers: [P2PAllocationsService, P2PAllocationExpiryWorker],
  controllers: [P2PAllocationsController],
  exports: [P2PAllocationsService],
})
export class P2PAllocationsModule {}
