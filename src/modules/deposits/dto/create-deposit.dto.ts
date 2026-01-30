import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { RequestPurpose } from '@prisma/client';

const RequestPurposeEnum =
  (RequestPurpose as any) ??
  ({
    DIRECT: 'DIRECT',
    P2P: 'P2P',
  } as const);

export class CreateDepositDto {
  /** @deprecated userId is derived from the authenticated user. */
  @ApiProperty({ example: 'user-1', description: 'User placing the deposit (deprecated).', required: false })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ example: '1000000', description: 'Deposit amount in IRR as a decimal string.' })
  @IsNumberString()
  amount!: string;

  @ApiProperty({ required: false, enum: RequestPurposeEnum, description: 'Purpose of the deposit request.' })
  @IsOptional()
  @IsEnum(RequestPurposeEnum)
  purpose?: RequestPurpose;

  @ApiProperty({ example: 'bank-transfer', description: 'Deposit method, e.g. bank-transfer or card-to-card.' })
  @IsString()
  method!: string;

  @ApiProperty({ required: false, example: 'TRX-2025-0001', description: 'Reference number for reconciliation.' })
  @IsOptional()
  @IsString()
  refNo?: string;

  @ApiProperty({ required: false, example: 'Sent via Mellat gateway', description: 'Optional user note.' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['file-id-123'],
    description: 'Optional list of file IDs attached as receipts.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];
}
