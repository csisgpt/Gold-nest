import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';

export class UserMinimalDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  fullName!: string | null;

  @ApiProperty()
  mobile!: string;
}

export class UserSafeDto extends UserMinimalDto {
  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiPropertyOptional({ nullable: true })
  tahesabCustomerCode?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
