import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  mobile: string;
  role: UserRole;
}

export interface JwtRequestUser {
  id: string;
  mobile: string;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
      super({
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        ignoreExpiration: false,
        secretOrKey: configService.get<string>('JWT_SECRET') || 'changeme-dev-secret',
      });
    }

  async validate(payload: JwtPayload): Promise<JwtRequestUser> {
    return { id: payload.sub, mobile: payload.mobile, role: payload.role };
  }
}
