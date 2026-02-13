import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export enum GroupResyncMode {
  ONLY_LINKED = 'ONLY_LINKED',
  ALL = 'ALL',
}

export class ResyncGroupUsersDto {
  @ApiProperty({ enum: GroupResyncMode })
  @IsEnum(GroupResyncMode)
  mode!: GroupResyncMode;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];
}
