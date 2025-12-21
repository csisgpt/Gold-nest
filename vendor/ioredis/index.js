const { EventEmitter } = require('events');

function nowMs() {
  return Date.now();
}

class InMemoryStore {
  constructor() {
    this.store = new Map();
  }

  set(key, value, ttlSeconds) {
    const expiresAt = ttlSeconds ? nowMs() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < nowMs()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  del(key) {
    return this.store.delete(key) ? 1 : 0;
  }
}

const sharedStore = new InMemoryStore();
const channelSubscribers = new Map();

class Redis extends EventEmitter {
  constructor(_uri, options = {}) {
    super();
    this.options = typeof _uri === 'string' ? { ...options, uri: _uri } : _uri || {};
    this.status = 'wait';
  }

  async connect() {
    this.status = 'ready';
    this.emit('ready');
    return 'OK';
  }

  async ping(message) {
    return message ? message : 'PONG';
  }

  async quit() {
    this.status = 'end';
    this.removeAllListeners();
    return 'OK';
  }

  duplicate() {
    return new Redis(undefined, this.options);
  }

  _parseSetArgs(args) {
    if (args.length >= 2 && typeof args[0] === 'string' && typeof args[1] === 'number') {
      return args[1];
    }
    if (args.length >= 3 && typeof args[1] === 'string' && args[1].toUpperCase() === 'EX') {
      return Number(args[2]);
    }
    return undefined;
  }

  async set(key, value, ...args) {
    const ttl = this._parseSetArgs(args);
    sharedStore.set(key, value, ttl);
    return 'OK';
  }

  async get(key) {
    return sharedStore.get(key);
  }

  async del(key) {
    return sharedStore.del(key);
  }

  async publish(channel, message) {
    const subs = channelSubscribers.get(channel) || [];
    for (const handler of subs) {
      try {
        handler(channel, message);
      } catch (err) {
        this.emit('error', err);
      }
    }
    this.emit('message', channel, message);
    return subs.length;
  }

  async subscribe(channel) {
    const subs = channelSubscribers.get(channel) || [];
    const handler = (ch, message) => this.emit('message', ch, message);
    subs.push(handler);
    channelSubscribers.set(channel, subs);
    return subs.length;
  }
}

module.exports = Redis;
module.exports.default = Redis;
module.exports.Redis = Redis;
module.exports.Cluster = class Cluster extends Redis {};
