import { CanActivate, ExecutionContext } from '@nestjs/common';

export declare function PassportStrategy<T extends new (...args: any[]) => any>(
  baseStrategy: T,
  name?: string,
): new (...args: ConstructorParameters<T>) => InstanceType<T>;

export declare function AuthGuard(name?: string): new () => CanActivate;
