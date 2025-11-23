import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateDepositDto {
  @ApiProperty({ example: 'user-1', description: 'User placing the deposit.' })
  @IsString()
  userId!: string;

  @ApiProperty({ example: '1000000', description: 'Deposit amount in IRR as a decimal string.' })
  @IsNumberString()
  amount!: string;

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
