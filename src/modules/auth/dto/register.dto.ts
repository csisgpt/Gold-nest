import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsMobilePhone, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Ali Ahmadi' })
  @IsString()
  fullName!: string;

  @ApiProperty({ example: '09121234567' })
  @IsString()
  @IsMobilePhone('fa-IR', {}, { message: 'Invalid Iranian mobile number.' })
  mobile!: string;

  @ApiProperty({ example: 'strongPass123' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ required: false, example: 'ali@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
