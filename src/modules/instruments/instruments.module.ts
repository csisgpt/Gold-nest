import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InstrumentsService } from './instruments.service';
import { InstrumentsController } from './instruments.controller';

@Module({
  imports: [PrismaModule],
  controllers: [InstrumentsController],
  providers: [InstrumentsService],
  exports: [InstrumentsService],
})
export class InstrumentsModule {}
