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

  @ApiProperty({ description: 'Inline preview URL' })
  previewUrl: string;

  @ApiProperty({ description: 'Attachment download URL' })
  downloadUrl: string;

  @ApiPropertyOptional({ description: 'Deprecated alias for downloadUrl' })
  url?: string;

  @ApiPropertyOptional({ description: 'Seconds until expiration for presigned URLs' })
  expiresInSeconds?: number;
}
