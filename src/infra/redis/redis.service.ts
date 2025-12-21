import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

export interface RedisHealth {
  enabled: boolean;
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

interface RedisConfig {
  uri?: string;
  tls?: boolean;
  keyPrefix: string;
  defaultTtlSec: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private commandClient: Redis | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private enabled = false;
  private keyPrefix = 'gn:';
  private defaultTtlSec = 30;

  constructor(private readonly configService: ConfigService) {}

  private maskUri(uri?: string): string {
    if (!uri) return '';
    const parts = uri.split('@');
    if (parts.length === 2) {
      const authPart = parts[0];
      const maskedAuth = authPart.includes(':') ? `${authPart.split(':')[0]}:***` : '***';
      return `${maskedAuth}@${parts[1]}`;
    }
    return uri;
  }

  private resolveConfig(): RedisConfig {
    const uri = this.configService.get<string>('REDIS_URI');
    const tlsFlag = (this.configService.get<string>('REDIS_TLS') ?? 'false').toLowerCase() === 'true';
    const keyPrefix = this.configService.get<string>('REDIS_KEY_PREFIX') ?? 'gn:';
    const defaultTtlSec = Number(this.configService.get<string>('REDIS_DEFAULT_TTL_SEC') ?? '30');

    if (uri) {
      return { uri, tls: tlsFlag, keyPrefix, defaultTtlSec };
    }

    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<string>('REDIS_PORT');
    if (host && port) {
      const password = this.configService.get<string>('REDIS_PASSWORD');
      const authSegment = password ? `:${password}@` : '';
      return { uri: `redis://${authSegment}${host}:${port}/0`, tls: tlsFlag, keyPrefix, defaultTtlSec };
    }

    return { keyPrefix, defaultTtlSec, tls: tlsFlag };
  }

  private createClient(uri: string, options: RedisOptions): Redis {
    const client = new Redis(uri, options);
    client.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`);
    });
    return client;
  }

  async onModuleInit(): Promise<void> {
    const cfg = this.resolveConfig();
    this.keyPrefix = cfg.keyPrefix;
    this.defaultTtlSec = cfg.defaultTtlSec;

    if (!cfg.uri) {
      this.enabled = false;
      this.logger.warn('Redis disabled: REDIS_URI/REDIS_HOST not configured');
      return;
    }

    const options: RedisOptions = {
      keyPrefix: cfg.keyPrefix,
      tls: cfg.tls ? {} : null,
      connectTimeout: 5000,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 200, 5000),
    };

    this.logger.log(`Connecting to redis at ${this.maskUri(cfg.uri)} ...`);
    this.commandClient = this.createClient(cfg.uri, options);
    this.pubClient = this.createClient(cfg.uri, options);
    this.subClient = this.createClient(cfg.uri, options);

    try {
      await this.commandClient.connect();
      const started = Date.now();
      await this.commandClient.ping();
      const latency = Date.now() - started;
      this.logger.log(`Redis connected (latency ${latency}ms)`);
      this.enabled = true;
    } catch (err) {
      this.logger.error('Failed to connect to Redis, disabling module', err as any);
      await this.onModuleDestroy();
      this.enabled = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const client of [this.commandClient, this.pubClient, this.subClient]) {
      if (client) {
        await client.quit();
      }
    }
    this.commandClient = null;
    this.pubClient = null;
    this.subClient = null;
  }

  private ensureEnabled(): asserts this is this & { commandClient: Redis; pubClient: Redis; subClient: Redis } {
    if (!this.enabled || !this.commandClient || !this.pubClient || !this.subClient) {
      throw new Error('Redis is disabled or unavailable');
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    this.ensureEnabled();
    const raw = await this.commandClient.get(this.withPrefix(key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async setJson(key: string, value: any, ttlSec?: number): Promise<void> {
    this.ensureEnabled();
    const payload = JSON.stringify(value);
    const ttl = ttlSec ?? this.defaultTtlSec;
    await this.commandClient.set(this.withPrefix(key), payload, 'EX', ttl);
  }

  async del(key: string): Promise<void> {
    this.ensureEnabled();
    await this.commandClient.del(this.withPrefix(key));
  }

  async publish(channel: string, payload: any): Promise<void> {
    this.ensureEnabled();
    await this.pubClient.publish(channel, JSON.stringify(payload));
  }

  async subscribe(channel: string, handler: (payload: any) => void): Promise<void> {
    this.ensureEnabled();
    await this.subClient.subscribe(channel);
    this.subClient.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          handler(JSON.parse(message));
        } catch (err) {
          this.logger.error(`Redis subscribe handler failed for ${channel}: ${(err as Error).message}`);
        }
      }
    });
  }

  private withPrefix(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async health(): Promise<RedisHealth> {
    if (!this.enabled || !this.commandClient) {
      return { enabled: false, ok: false, error: 'Redis disabled' };
    }
    const started = Date.now();
    try {
      await this.commandClient.ping();
      return { enabled: true, ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return { enabled: true, ok: false, error: (err as Error).message };
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
