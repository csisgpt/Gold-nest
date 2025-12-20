import { ApiProperty } from '@nestjs/swagger';
import { AttachmentEntityType } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class ListAttachmentsQueryDto {
  @ApiProperty({ enum: AttachmentEntityType })
  @IsEnum(AttachmentEntityType)
  entityType!: AttachmentEntityType;

  @ApiProperty()
  @IsString()
  entityId!: string;
}
