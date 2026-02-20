import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentDestinationDirection, PaymentDestinationStatus, PaymentDestinationType } from '@prisma/client';

const PaymentDestinationTypeEnum =
  (PaymentDestinationType as any) ??
  ({
    IBAN: 'IBAN',
    CARD: 'CARD',
    ACCOUNT: 'ACCOUNT',
  } as const);
const PaymentDestinationStatusEnum =
  (PaymentDestinationStatus as any) ??
  ({
    ACTIVE: 'ACTIVE',
    PENDING_VERIFY: 'PENDING_VERIFY',
    DISABLED: 'DISABLED',
  } as const);
const PaymentDestinationDirectionEnum =
  (PaymentDestinationDirection as any) ??
  ({
    PAYOUT: 'PAYOUT',
    COLLECTION: 'COLLECTION',
  } as const);

export class PaymentDestinationViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PaymentDestinationTypeEnum })
  type!: PaymentDestinationType;

  @ApiProperty()
  maskedValue!: string;

  @ApiPropertyOptional({ nullable: true })
  bankName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  ownerNameMasked?: string | null;

  @ApiPropertyOptional({ nullable: true })
  title?: string | null;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ enum: PaymentDestinationStatusEnum })
  status!: PaymentDestinationStatus;

  @ApiPropertyOptional({ nullable: true })
  lastUsedAt?: Date | null;
}

export class CreatePaymentDestinationDto {
  @ApiProperty({ enum: PaymentDestinationTypeEnum })
  @IsEnum(PaymentDestinationTypeEnum)
  type!: PaymentDestinationType;

  @ApiProperty({ description: 'IBAN/card/account value to store.' })
  @IsString()
  value!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdatePaymentDestinationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ enum: PaymentDestinationStatusEnum })
  @IsOptional()
  @IsEnum(PaymentDestinationStatusEnum)
  status?: PaymentDestinationStatus;
}

export class AdminDestinationQueryDto {
  @ApiPropertyOptional({ enum: PaymentDestinationDirectionEnum })
  @IsOptional()
  @IsEnum(PaymentDestinationDirectionEnum)
  direction?: PaymentDestinationDirection;
}

export class CreateSystemDestinationDto {
  @ApiProperty({ enum: PaymentDestinationTypeEnum })
  @IsEnum(PaymentDestinationTypeEnum)
  type!: PaymentDestinationType;

  @ApiProperty()
  @IsString()
  value!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}


export class AdminSystemDestinationDetailDto extends PaymentDestinationViewDto {
  @ApiPropertyOptional({ nullable: true })
  fullValue?: string | null;

  @ApiPropertyOptional({ nullable: true })
  ownerName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  deletedAt?: Date | null;
}

export class UpdateSystemDestinationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional({ description: 'Optional new full destination value.' })
  @IsOptional()
  @IsString()
  fullValue?: string;
}

export class SetSystemDestinationStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
