// src/users/users.controller.ts
import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // POST /users  => ایجاد کاربر جدید
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
