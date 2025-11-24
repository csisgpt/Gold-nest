const crypto = require('crypto');
const { UnauthorizedException } = require('@nestjs/common');

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function decodePayload(token, secret, ignoreExpiration) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new UnauthorizedException('Invalid token');
  const [header, body, signature] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  if (expected !== signature) throw new UnauthorizedException('Invalid signature');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!ignoreExpiration && payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new UnauthorizedException('Token expired');
  }
  return payload;
}

const ExtractJwt = {
  fromAuthHeaderAsBearerToken: () => (req) => {
    const auth = req?.headers?.authorization;
    if (!auth) return null;
    const [scheme, token] = auth.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
    return token;
  },
};

class Strategy {
  constructor(options = {}, verify) {
    this.options = options;
    this.verify = verify;
  }

  async authenticate(req) {
    const extractor = this.options.jwtFromRequest || ((r) => r?.headers?.authorization);
    const token = extractor(req);
    if (!token) {
      throw new UnauthorizedException('No auth token provided');
    }
    const payload = decodePayload(token, this.options.secretOrKey || 'changeme-dev-secret', this.options.ignoreExpiration);
    if (typeof this.validate === 'function') {
      return this.validate(payload);
    }
    if (typeof this.verify === 'function') {
      return await new Promise((resolve, reject) => {
        this.verify(payload, (err, user) => {
          if (err) return reject(err);
          resolve(user);
        });
      });
    }
    return payload;
  }
}

module.exports = { Strategy, ExtractJwt };
