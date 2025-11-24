import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsMobilePhone,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({
    example: 'Ali Ahmadi',
    description: 'Full name of the user.',
  })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({
    example: '09121234567',
    description: 'Mobile phone number (Iran format).',
  })
  @IsString()
  @IsMobilePhone('fa-IR', {}, { message: 'Invalid Iranian mobile number.' })
  mobile!: string;

  @ApiProperty({
    example: 'ali@example.com',
    description: 'User email address.',
  })
  @IsEmail({}, { message: 'Invalid email format.' })
  email!: string;

  @ApiProperty({
    example: 'strongPass123',
    minLength: 6,
    description: 'User password (minimum 6 characters).',
  })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters.' })
  password!: string;

  @ApiProperty({
    required: false,
    enum: UserRole,
    example: UserRole.CLIENT,
    description: 'User role (default = CLIENT).',
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'Invalid user role.' })
  role?: UserRole;
}
