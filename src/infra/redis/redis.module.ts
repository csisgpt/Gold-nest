import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisHealthController } from './redis.health.controller';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
  controllers: [RedisHealthController],
})
export class RedisModule {}
