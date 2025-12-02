import { ApiProperty } from '@nestjs/swagger';

export class RemittanceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fromUserId!: string;

  @ApiProperty()
  toUserId!: string;

  @ApiProperty()
  toMobile!: string;

  @ApiProperty()
  instrumentCode!: string;

  @ApiProperty({ description: 'Amount as string' })
  amount!: string;

  @ApiProperty({ required: false })
  note?: string;

  @ApiProperty()
  createdAt!: Date;
}
