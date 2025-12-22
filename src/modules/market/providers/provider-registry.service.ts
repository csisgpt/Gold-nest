import { Injectable, Logger } from '@nestjs/common';
import { PriceProvider } from './price-provider.interface';

@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private providers = new Map<string, PriceProvider>();

  register(provider: PriceProvider): void {
    this.logger.log(`Registering price provider ${provider.key}`);
    this.providers.set(provider.key, provider);
  }

  get(key: string): PriceProvider | undefined {
    return this.providers.get(key);
  }

  list(): PriceProvider[] {
    return Array.from(this.providers.values());
  }
}
