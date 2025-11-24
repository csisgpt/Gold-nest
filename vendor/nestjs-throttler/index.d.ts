import { CanActivate, DynamicModule, ExecutionContext } from '@nestjs/common';

export interface ThrottlerModuleOptions {
  ttl: number;
  limit: number;
}

export declare const THROTTLER_OPTIONS: string;
export declare function Throttle(limit: number, ttl: number): MethodDecorator & ClassDecorator;

export declare class ThrottlerModule {
  static forRoot(options: ThrottlerModuleOptions): DynamicModule;
}

export declare class ThrottlerGuard implements CanActivate {
  private readonly options: ThrottlerModuleOptions;
  private readonly storage: Map<string, { count: number; resetAt: number }>;
  constructor(options?: ThrottlerModuleOptions);
  canActivate(context: ExecutionContext): boolean | Promise<boolean>;
}
