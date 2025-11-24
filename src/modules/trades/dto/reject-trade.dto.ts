import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RejectTradeDto {
  @ApiProperty({
    required: false,
    example: 'Insufficient documents provided.',
    description: 'Reason provided by admin for rejecting the trade.',
  })
  @IsOptional()
  @IsString()
  rejectReason?: string;

  /** @deprecated rejectedById is ignored; server will use current authenticated admin instead. */
  @ApiProperty({
    required: false,
    example: 'admin-2',
    description: 'Identifier of the admin who rejected the trade.',
  })
  @IsOptional()
  @IsString()
  rejectedById?: string;
}
