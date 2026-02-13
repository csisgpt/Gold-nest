import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PolicyAuditEntityType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UpdateUserKycDto } from './dto/user-kyc.dto';
import { runInTx } from '../../common/db/tx.util';
import { PaginationService } from '../../common/pagination/pagination.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';

@ApiTags('admin-user-kyc')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller()
export class UserKycAdminController {
  constructor(private readonly prisma: PrismaService, private readonly paginationService: PaginationService) {}



  @Get('admin/kyc/queue')
  async queue(@Query() query: any) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.level) where.level = query.level;

    const { page, limit, skip, take } = this.paginationService.getSkipTake(Number(query.page ?? 1), Number(query.limit ?? 20));
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.userKyc.findMany({ where, include: { user: true }, skip, take, orderBy: { updatedAt: 'desc' } }),
      this.prisma.userKyc.count({ where }),
    ]);

    return this.paginationService.wrap(
      items.map((item) => ({
        user: { id: item.user.id, fullName: item.user.fullName, mobile: item.user.mobile, email: item.user.email },
        kyc: item,
        submittedAt: item.updatedAt,
      })),
      totalItems,
      page,
      limit,
    );
  }
  @Get('admin/users/:id/kyc')
  get(@Param('id') id: string) {
    return this.prisma.userKyc.findUnique({ where: { userId: id } });
  }

  @Put('admin/users/:id/kyc')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserKycDto,
    @CurrentUser() actor: JwtRequestUser,
  ) {
    return runInTx(this.prisma, async (tx) => {
      const before = await tx.userKyc.findUnique({ where: { userId: id } });

      const updated = await tx.userKyc.upsert({
        where: { userId: id },
        create: {
          userId: id,
          status: dto.status,
          level: dto.level,
          verifiedAt: dto.status === 'VERIFIED' ? new Date() : null,
          rejectedAt: dto.status === 'REJECTED' ? new Date() : null,
          rejectReason: dto.reason,
        },
        update: {
          status: dto.status,
          level: dto.level,
          verifiedAt: dto.status === 'VERIFIED' ? new Date() : null,
          rejectedAt: dto.status === 'REJECTED' ? new Date() : null,
          rejectReason: dto.reason,
        },
      });

      await tx.policyAuditLog.create({
        data: {
          entityType: PolicyAuditEntityType.USER_KYC,
          entityId: id,
          actorId: actor?.id,
          beforeJson: before ?? null,
          afterJson: updated,
          reason: dto.reason,
        },
      });

      return updated;
    });
  }
}
