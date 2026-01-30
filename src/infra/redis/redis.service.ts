// src/infra/redis/redis.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

type Json = Record<string, any> | any[] | string | number | boolean | null;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private commandClient: Redis | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  private readonly defaultTtlSec: number;

  private messageListenerAttached = false;
  private channelHandlers = new Map<string, Set<(payload: any) => void>>();

  constructor(private readonly config: ConfigService) {
    this.defaultTtlSec = this.config.get<number>('REDIS_DEFAULT_TTL_SEC') ?? 60;

    // Eager init (safe)
    this.init().catch((err) => {
      this.logger.error(`Redis init failed: ${(err as Error).message}`);
    });
  }


  private async init(): Promise<void> {
    if (this.commandClient && this.pubClient && this.subClient) return;

    // Vendor ioredis typings are minimal in this repo.
    // Prefer REDIS_URL and keep options minimal.
    const url = this.config.get<string>('REDIS_URL');
    const keyPrefix = this.config.get<string>('REDIS_KEY_PREFIX') ?? '';

    const opts: any = { keyPrefix };

    this.commandClient = url ? new (Redis as any)(url, opts) : new (Redis as any)(opts);
    this.pubClient = url ? new (Redis as any)(url, opts) : new (Redis as any)(opts);
    this.subClient = url ? new (Redis as any)(url, opts) : new (Redis as any)(opts);

    this.bindLogs(this.commandClient, 'command');
    this.bindLogs(this.pubClient, 'pub');
    this.bindLogs(this.subClient, 'sub');
  }

  private bindLogs(client: any, name: string) {
    if (!client?.on) return;
    client.on('connect', () => this.logger.log(`Redis ${name} connected`));
    client.on('ready', () => this.logger.log(`Redis ${name} ready`));
    client.on('error', (err: any) => this.logger.error(`Redis ${name} error: ${err?.message ?? err}`));
    client.on('close', () => this.logger.warn(`Redis ${name} connection closed`));
    client.on('reconnecting', () => this.logger.warn(`Redis ${name} reconnecting...`));
  }

  private clients() {
    if (!this.commandClient || !this.pubClient || !this.subClient) {
      throw new Error('Redis is not connected yet');
    }
    return { command: this.commandClient, pub: this.pubClient, sub: this.subClient };
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await (this.commandClient as any)?.quit?.();
    } catch { }
    try {
      await (this.pubClient as any)?.quit?.();
    } catch { }
    try {
      await (this.subClient as any)?.quit?.();
    } catch { }

    this.commandClient = null;
    this.pubClient = null;
    this.subClient = null;
  }

  async health(): Promise<{ ok: boolean; details?: any }> {
    try {
      const { command } = this.clients();
      const pong = await (command as any).ping();
      return { ok: pong === 'PONG' };
    } catch (err) {
      return { ok: false, details: { message: (err as Error).message } };
    }
  }

  async get(key: string): Promise<string | null> {
    const { command } = this.clients();
    return (command as any).get(key);
  }

  async set(key: string, value: string, ttlSec?: number): Promise<void> {
    const { command } = this.clients();
    const ttl = ttlSec ?? this.defaultTtlSec;
    await (command as any).set(key, value, 'EX', ttl);
  }

  isEnabled() {
    return false
  }
  // async setIfNotExists(key: string, value: any, ttlSec?: number): Promise<boolean> {
  //   this.ensureEnabled();
  //   const payload = JSON.stringify(value);
  //   const ttl = ttlSec ?? this.defaultTtlSec;
  //   const res = await this.commandClient.set(key, payload, 'NX', 'EX', ttl);
  //   return res === 'OK';
  // }

  async del(key: string): Promise<void> {
    const { command } = this.clients();
    await (command as any).del(key);
  }

  async getJson<T = Json>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`Redis getJson parse failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async setJson(key: string, value: any, ttlSec?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSec);
  }

  // Multi-get JSON without pipeline (vendor typings do not include pipeline()).
  async mgetJson<T = Json>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const raws = await Promise.all(keys.map((k) => this.get(k)));

    return raws.map((raw, idx) => {
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        this.logger.warn(`Redis mgetJson parse failed for key=${keys[idx]}`);
        return null;
      }
    });
  }

  // SET key value NX EX ttl
  async setIfNotExists(key: string, value: string, ttlSec: number): Promise<boolean> {
    const { command } = this.clients();
    const res = await (command as any).set(key, value, 'EX', ttlSec, 'NX');
    return res === 'OK';
  }

  async publish(channel: string, payload: any): Promise<void> {
    const { pub } = this.clients();
    await (pub as any).publish(channel, JSON.stringify(payload));
  }

  async subscribe<T = any>(channel: string, cb: (payload: T) => void): Promise<() => Promise<void>> {
    const { sub } = this.clients();

    if (!this.messageListenerAttached) {
      (sub as any).on('message', (ch: string, message: string) => {
        const handlers = this.channelHandlers.get(ch);
        if (!handlers || handlers.size === 0) return;

        let parsed: any;
        try {
          parsed = JSON.parse(message);
        } catch (err) {
          this.logger.warn(`Redis pubsub JSON parse failed for ${ch}: ${(err as Error).message}`);
          return;
        }

        for (const handler of handlers) {
          try {
            handler(parsed);
          } catch (err) {
            this.logger.error(`Redis subscribe handler failed for ${ch}: ${(err as Error).message}`);
          }
        }
      });

      this.messageListenerAttached = true;
    }

    const set = this.channelHandlers.get(channel) ?? new Set<(payload: any) => void>();
    set.add(cb as any);
    this.channelHandlers.set(channel, set);

    await (sub as any).subscribe(channel);

    return async () => {
      const channelSet = this.channelHandlers.get(channel);
      if (!channelSet) return;

      channelSet.delete(cb as any);

      if (channelSet.size === 0) {
        this.channelHandlers.delete(channel);

        // vendor typings may not include unsubscribe; call if exists at runtime
        try {
          const fn = (sub as any).unsubscribe;
          if (typeof fn === 'function') {
            await fn.call(sub, channel);
          }
        } catch (err) {
          this.logger.error(`Redis unsubscribe failed for ${channel}: ${(err as Error).message}`);
        }
      }
    };
  }
}
