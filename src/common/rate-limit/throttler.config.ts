import { ThrottlerModule } from '@nestjs/throttler';

export const ThrottlerRootModule = ThrottlerModule.forRoot({
  ttl: 60,
  limit: 60,
});
