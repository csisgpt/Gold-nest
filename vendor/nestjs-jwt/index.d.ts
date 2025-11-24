import { DynamicModule } from '@nestjs/common';

export interface JwtSignOptions {
  expiresIn?: string | number;
  secret?: string;
  secretOrPrivateKey?: string;
  secretOrKey?: string;
}

export interface JwtModuleOptions extends JwtSignOptions {}

export declare class JwtService {
  constructor(options?: JwtModuleOptions);
  sign(payload: any, options?: JwtSignOptions): string;
  signAsync(payload: any, options?: JwtSignOptions): Promise<string>;
  verify<T = any>(token: string, options?: JwtSignOptions & { ignoreExpiration?: boolean }): T;
  verifyAsync<T = any>(token: string, options?: JwtSignOptions & { ignoreExpiration?: boolean }): Promise<T>;
}

export declare class JwtModule {
  static register(options?: JwtModuleOptions): DynamicModule;
  static registerAsync(options: {
    imports?: any[];
    inject?: any[];
    providers?: any[];
    useFactory: (...args: any[]) => JwtModuleOptions;
  }): DynamicModule;
}
