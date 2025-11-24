const { UnauthorizedException } = require('@nestjs/common');

const strategies = new Map();

function registerStrategy(name, strategy) {
  strategies.set(name, strategy);
}

function PassportStrategy(baseStrategy, name) {
  return class extends baseStrategy {
    constructor(...args) {
      super(...args);
      this.name = name || baseStrategy.name;
      registerStrategy(this.name, this);
    }
  };
}

class BaseAuthGuard {
  constructor(name = 'default') {
    this.name = name;
  }

  async canActivate(context) {
    const strategy = strategies.get(this.name);
    if (!strategy) {
      throw new UnauthorizedException('Strategy not found');
    }
    const req = context.switchToHttp().getRequest();
    const user = await strategy.authenticate(req);
    if (!user) {
      throw new UnauthorizedException();
    }
    req.user = user;
    return true;
  }
}

function AuthGuard(name = 'default') {
  return class extends BaseAuthGuard {
    constructor() {
      super(name);
    }
  };
}

module.exports = { PassportStrategy, AuthGuard };
