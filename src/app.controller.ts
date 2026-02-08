import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './modules/prisma/prisma.service';

@ApiTags('system')
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
  @ApiOkResponse({
    description: 'Standard success envelope.',
    content: {
      'application/json': {
        example: {
          ok: true,
          result: { message: 'Gold Trading API is running' },
          traceId: 'req_1234567890',
          ts: '2024-01-01T00:00:00.000Z',
        },
      },
    },
  })
  root() {
    return { message: 'Gold Trading API is running' };
  }
}
