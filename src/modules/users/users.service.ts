// src/users/users.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma, User, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';
import { TahesabOutboxService } from '../tahesab/tahesab-outbox.service';
import { TahesabIntegrationConfigService } from '../tahesab/tahesab-integration.config';
import {
  DoEditMoshtariRequestDto,
  DoNewMoshtariRequestDto,
} from '../tahesab/dto/moshtari.dto';
import { userSafeSelect } from '../../common/prisma/selects/user.select';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tahesabOutbox: TahesabOutboxService,
    private readonly tahesabIntegration: TahesabIntegrationConfigService,
  ) { }

  async findById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userSafeSelect,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByMobile(mobile: string) {
    const user = await this.prisma.user.findUnique({
      where: { mobile },
      select: userSafeSelect,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: userSafeSelect,
    });
  }

  async findWithPasswordByIdentifier(identifier: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ mobile: identifier }, { email: identifier }],
      },
    });
  }

  async findWithPasswordByMobile(mobile: string) {
    return this.prisma.user.findUnique({ where: { mobile } });
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
          tahesabCustomerCode: dto.tahesabCustomerCode ?? undefined,
        },
      });

      // برای امنیت، بهتره پسورد رو در ریسپانس نفرستیم
      const { password: _removed, ...safeUser } = user;
      await this.enqueueTahesabOnCreate(user);
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

  async activateUser(userId: string) {

    try {
      //   const user = await this.prisma.user.findUnique(
      //     {
      //       where: {
      //         id: userId
      //       }
      //     },
      //   )

      //   console.log(user)



      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          email: undefined,
          fullName: undefined,
          password: undefined,
          status: UserStatus.ACTIVE
        },
      });

      const { password: _pw, ...safeUser } = user;
      // await this.enqueueTahesabOnEdit(user);
      return safeUser;
    } catch (e: any) {
      console.log(e)
      throw Error(e)
    }
  }


  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email ?? undefined,
        fullName: dto.name ?? undefined,
        password: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
      },
    });

    const { password: _pw, ...safeUser } = user;
    await this.enqueueTahesabOnEdit(user);
    return safeUser;
  }


  private buildMoshtariCreateDto(
    user: Pick<User, 'fullName' | 'mobile' | 'tahesabCustomerCode'> & {
      customerGroup?: { tahesabGroupName: string | null; code: string } | null;
    },
  ): DoNewMoshtariRequestDto {
    return {
      name: (user.fullName as string) ?? '',
      groupName: user.customerGroup?.tahesabGroupName ?? user.customerGroup?.code ?? 'DEFAULT',
      tel: (user.mobile as string) ?? '',
      address: '',
      nationalCode: '',
      moshtariCode: user.tahesabCustomerCode ?? undefined,
      jensFelez: 0,
    };
  }

  private buildMoshtariEditDto(
    user: Pick<User, 'id' | 'fullName' | 'mobile' | 'tahesabCustomerCode'> & {
      customerGroup?: { tahesabGroupName: string | null; code: string } | null;
    },
  ): DoEditMoshtariRequestDto {
    return {
      moshtariCode: user.tahesabCustomerCode!,
      name: (user.fullName as string) ?? '',
      groupName: user.customerGroup?.tahesabGroupName ?? user.customerGroup?.code ?? 'DEFAULT',
      tel: (user.mobile as string) ?? '',
      address: '',
      nationalCode: '',
      description: '',
    };
  }

  private async enqueueTahesabOnCreate(user: User) {
    if (!this.tahesabIntegration.isEnabled()) return;
    if (!user.tahesabCustomerCode) {
      // TODO: optionally auto-create Tahesab customers when no explicit code is provided.
      return;
    }

    const withGroup = (await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        fullName: true,
        mobile: true,
        tahesabCustomerCode: true,
        customerGroup: { select: { code: true, tahesabGroupName: true } },
      },
    })) as Pick<User, 'id' | 'fullName' | 'mobile' | 'tahesabCustomerCode'> & {
      customerGroup?: { code: string; tahesabGroupName: string | null } | null;
    };

    if (!withGroup) return;

    const dto = this.buildMoshtariCreateDto(withGroup);
    await this.tahesabOutbox.enqueueOnce('DoNewMoshtari', dto, {
      correlationId: `customer:create:${user.id}`,
    });
  }

  private async enqueueTahesabOnEdit(user: User) {
    if (!this.tahesabIntegration.isEnabled()) return;
    if (!user.tahesabCustomerCode) return;

    const withGroup = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        fullName: true,
        mobile: true,
        tahesabCustomerCode: true,
        customerGroup: { select: { code: true, tahesabGroupName: true } },
      },
    });

    if (!withGroup) return;

    const dto = this.buildMoshtariEditDto(withGroup as any);
    await this.tahesabOutbox.enqueueOnce('DoEditMoshtari', dto, {
      correlationId: `customer:edit:${user.id}:${new Date().toISOString()}`,
    });
  }
}
