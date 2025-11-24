// src/users/users.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly safeUserSelect: Prisma.UserSelect = {
    id: true,
    createdAt: true,
    updatedAt: true,
    fullName: true,
    mobile: true,
    email: true,
    role: true,
    status: true,
  };

  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.safeUserSelect,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByMobile(mobile: string) {
    const user = await this.prisma.user.findUnique({
      where: { mobile },
      select: this.safeUserSelect,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: this.safeUserSelect,
    });
  }

  async findWithPasswordByIdentifier(identifier: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ mobile: identifier }, { email: identifier }],
      },
    });
  }

  async create(dto: CreateUserDto) {
    const { fullName, mobile, email, password, role } = dto;

    // 1) هش کردن پسورد
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const user = await this.prisma.user.create({
        data: {
          fullName,
          mobile,
          email,
          password: hashedPassword,
          role: role ?? undefined, // اگر نفرستی، همون default دیتابیس می‌مونه (CLIENT)
          // status به صورت پیش‌فرض PENDING_APPROVAL هست طبق schema.prisma
        },
      });

      // برای امنیت، بهتره پسورد رو در ریسپانس نفرستیم
      const { password: _removed, ...safeUser } = user;
      return safeUser;
    } catch (error: any) {
      // هندل خطای unique روی mobile و email
      if (error.code === 'P2002') {
        const target = error.meta?.target as string[] | undefined;

        if (target?.includes('mobile')) {
          throw new ConflictException('این شماره موبایل قبلا ثبت شده است');
        }
        if (target?.includes('email')) {
          throw new ConflictException('این ایمیل قبلا ثبت شده است');
        }

        throw new ConflictException('کاربری با این اطلاعات قبلا ثبت شده است');
      }

      console.error('Error creating user:', error);
      throw new InternalServerErrorException('خطا در ایجاد کاربر');
    }
  }
}
