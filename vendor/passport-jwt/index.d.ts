import { Request } from 'express';

export interface StrategyOptions {
  jwtFromRequest?: (req: Request) => string | null;
  secretOrKey?: string;
  ignoreExpiration?: boolean;
}

export declare class Strategy {
  constructor(options?: StrategyOptions, verify?: any);
  authenticate(req: Request): Promise<any>;
}

export declare const ExtractJwt: {
  fromAuthHeaderAsBearerToken(): (req: Request) => string | null;
};
