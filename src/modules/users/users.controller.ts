// src/users/users.controller.ts
import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // POST /users  => ایجاد کاربر جدید
  // Regular users should register via /auth/register. These endpoints are intended for admin panel usage.
  @Post('users')
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  // GET /users  => لیست همه کاربران
  @Get('users')
  async findAll() {
    return this.usersService.findAll();
  }

  // GET /users/:id  => دریافت یک کاربر با id
  @Get('users/:id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
