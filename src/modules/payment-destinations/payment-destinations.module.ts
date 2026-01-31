import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentDestinationsService } from './payment-destinations.service';
import { PaymentDestinationsController } from './payment-destinations.controller';

@Module({
  imports: [PrismaModule],
  providers: [PaymentDestinationsService],
  controllers: [PaymentDestinationsController],
  exports: [PaymentDestinationsService],
})
export class PaymentDestinationsModule {}
