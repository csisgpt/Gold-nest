import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PolicyAuditEntityType, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaginationService } from '../../common/pagination/pagination.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

class PolicyAuditQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 20;
  @IsOptional() @IsEnum(PolicyAuditEntityType) entityType?: PolicyAuditEntityType;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() actorId?: string;
}

@ApiTags('admin-policy-audit')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/audit/policy')
export class PolicyAuditAdminController {
  constructor(private readonly prisma: PrismaService, private readonly paginationService: PaginationService) {}

  @Get()
  async list(@Query() query: PolicyAuditQueryDto) {
    const where: any = {};
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.actorId) where.actorId = query.actorId;

    const { page, limit, skip, take } = this.paginationService.getSkipTake(query.page, query.limit);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.policyAuditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.policyAuditLog.count({ where }),
    ]);

    return this.paginationService.wrap(items, totalItems, page, limit);
  }
}
