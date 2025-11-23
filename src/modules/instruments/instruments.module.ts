import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InstrumentsService } from './instruments.service';

@Module({
  imports: [PrismaModule],
  providers: [InstrumentsService],
  exports: [InstrumentsService],
})
export class InstrumentsModule {}
