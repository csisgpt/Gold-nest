import { IsMobilePhone, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: '09121234567' })
  @IsString()
  @IsMobilePhone('fa-IR', {}, { message: 'Invalid Iranian mobile number.' })
  mobile!: string;

  @ApiProperty({ example: 'strongPass123' })
  @IsString()
  password!: string;
}
