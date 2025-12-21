import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  pages!: number;

  @ApiProperty()
  hasNext!: boolean;

  @ApiProperty()
  hasPrev!: boolean;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  items!: T[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta!: PaginationMetaDto;
}

