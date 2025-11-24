const { Module } = require('@nestjs/common');
const crypto = require('crypto');

const JWT_OPTIONS = 'JWT_MODULE_OPTIONS';

function parseExpiresIn(input) {
  if (input === undefined || input === null) return undefined;
  if (typeof input === 'number') return input;
  const match = String(input).match(/^(\d+)([smhd])?$/);
  if (!match) return parseInt(input, 10);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit] || 1);
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signToken(payload, secret, expiresIn) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const expSeconds = expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined;
  const body = expSeconds ? { ...payload, exp: expSeconds } : payload;
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedBody = base64url(JSON.stringify(body));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

function verifyToken(token, secret, ignoreExpiration) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [encodedHeader, encodedBody, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest('base64url');
  if (expectedSig !== signature) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(encodedBody, 'base64url').toString('utf8'));
  if (!ignoreExpiration && payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
  return payload;
}

class JwtService {
  constructor(options = {}) {
    this.options = options;
  }

  sign(payload, options = {}) {
    const opts = { ...this.options, ...options, ...options.signOptions };
    const expiresIn = parseExpiresIn(opts.expiresIn || opts.signOptions?.expiresIn);
    const secret = opts.secret || opts.secretOrPrivateKey || opts.secretOrKey || 'changeme-dev-secret';
    return signToken(payload, secret, expiresIn);
  }

  signAsync(payload, options = {}) {
    return Promise.resolve(this.sign(payload, options));
  }

  verify(token, options = {}) {
    const opts = { ...this.options, ...options };
    const secret = opts.secret || opts.secretOrPublicKey || opts.secretOrKey || 'changeme-dev-secret';
    return verifyToken(token, secret, opts.ignoreExpiration);
  }

  verifyAsync(token, options = {}) {
    return Promise.resolve(this.verify(token, options));
  }
}

class JwtModule {
  static register(options = {}) {
    return {
      module: JwtModule,
      providers: [
        { provide: JWT_OPTIONS, useValue: options },
        { provide: JwtService, useFactory: (opts) => new JwtService(opts), inject: [JWT_OPTIONS] },
      ],
      exports: [JwtService],
    };
  }

  static registerAsync(options) {
    return {
      module: JwtModule,
      imports: options.imports || [],
      providers: [
        ...(options.providers || []),
        {
          provide: JWT_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        { provide: JwtService, useFactory: (opts) => new JwtService(opts), inject: [JWT_OPTIONS] },
      ],
      exports: [JwtService],
    };
  }
}

module.exports = { JwtModule, JwtService };
