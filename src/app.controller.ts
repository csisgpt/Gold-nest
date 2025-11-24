import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './modules/prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('db-health')
  async dbHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { connected: true };
    } catch (e) {
      return { connected: false, error: (e as any).message };
    }
  }

  @Get('/')
  root() {
    return { message: 'Gold Trading API is running' };
  }
}
