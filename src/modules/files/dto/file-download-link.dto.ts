import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FileDownloadLinkDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Original file name' })
  name: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiPropertyOptional({ nullable: true })
  label?: string | null;

  @ApiProperty({ enum: ['presigned', 'raw'] })
  method: 'presigned' | 'raw';

  @ApiProperty()
  url: string;

  @ApiPropertyOptional({ description: 'Seconds until expiration for presigned URLs' })
  expiresInSeconds?: number;
}
