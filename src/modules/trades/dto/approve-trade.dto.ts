import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApproveTradeDto {
  @ApiProperty({
    required: false,
    example: 'All checks passed, approving.',
    description: 'Optional note from the admin when approving the trade.',
  })
  @IsOptional()
  @IsString()
  adminNote?: string;

  /** @deprecated approvedById is ignored; server will use current authenticated admin instead. */
  @ApiProperty({
    required: false,
    example: 'admin-1',
    description: 'Identifier of the admin who approved the trade.',
  })
  @IsOptional()
  @IsString()
  approvedById?: string;
}
