import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtRequestUser } from './jwt.strategy';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtRequestUser | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
