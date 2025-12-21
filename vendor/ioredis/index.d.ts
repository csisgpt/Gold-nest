import { EventEmitter } from 'events';

export interface RedisOptions {
  keyPrefix?: string;
  tls?: Record<string, unknown> | null;
  connectTimeout?: number;
  maxRetriesPerRequest?: number | null;
  retryStrategy?: (times: number) => number | null;
}

export default class Redis extends EventEmitter {
  status: string;
  options: RedisOptions;
  constructor(uri?: string | RedisOptions, options?: RedisOptions);
  connect(): Promise<string>;
  ping(message?: string): Promise<string>;
  quit(): Promise<string>;
  duplicate(): Redis;
  set(key: string, value: string, ...args: any[]): Promise<string>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string): Promise<number>;
}

export { Redis };
export class Cluster extends Redis {}
