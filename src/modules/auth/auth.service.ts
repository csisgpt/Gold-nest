import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    console.log(dto)
    const user = await this.usersService.findWithPasswordByMobile(dto.mobile);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, mobile: user.mobile, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);
    const { password: _removed, ...safeUser } = user;

    return { accessToken, user: safeUser };
  }

  async getProfile(userId: string) {
    return this.usersService.findById(userId);
  }

  async register(dto: RegisterDto) {
    const email = dto.email ?? `${dto.mobile}@auto.local`;

    return this.usersService.create({
      fullName: dto.fullName,
      mobile: dto.mobile,
      email,
      password: dto.password,
      role: UserRole.CLIENT,
    });
  }
}
