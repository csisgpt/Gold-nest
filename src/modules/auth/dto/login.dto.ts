import { IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  mobile!: string;

  @IsString()
  password!: string;
}
