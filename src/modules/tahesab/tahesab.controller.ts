import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TahesabService } from './tahesab.service';
import { TahesabOutboxService } from './tahesab-outbox.service';
import { PaginationService } from '../../common/pagination/pagination.service';
import { PrismaService } from '../prisma/prisma.service';
import { DoListMoshtariRequestDto } from './dto/moshtari.dto';
import { GetMandeHesabByCodeRequestDto } from './dto/customer-balance.dto';
import { DoListAsnadRequestDto } from './dto/list-documents.dto';

@ApiTags('Tahesab')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tahesab')
export class TahesabController {
  constructor(private readonly tahesabService: TahesabService, private readonly outbox: TahesabOutboxService, private readonly paginationService: PaginationService, private readonly prisma: PrismaService) {}

  @Get('ping')
  @Roles(UserRole.ADMIN)
  ping() {
    return this.tahesabService.ping();
  }

  @Post('customers/list')
  @Roles(UserRole.ADMIN)
  listCustomers(@Body() dto: DoListMoshtariRequestDto) {
    return this.tahesabService.listCustomers(dto);
  }

  @Post('customers/balance-by-code')
  @Roles(UserRole.ADMIN)
  getBalanceByCode(@Body() dto: GetMandeHesabByCodeRequestDto) {
    return this.tahesabService.getBalanceByCustomerCode(dto);
  }

  @Post('documents/list')
  @Roles(UserRole.ADMIN)
  listDocuments(@Body() dto: DoListAsnadRequestDto) {
    return this.tahesabService.listDocuments(dto);
  }


  @Get('/admin/tahesab/outbox')
  @Roles(UserRole.ADMIN)
  async listOutbox(@Query() query: any) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.method) where.method = query.method;
    if (query.correlationId) where.correlationId = { contains: query.correlationId, mode: 'insensitive' };
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const { page, limit, skip, take } = this.paginationService.getSkipTake(Number(query.page ?? 1), Number(query.limit ?? 20));
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.tahesabOutbox.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.tahesabOutbox.count({ where }),
    ]);

    return this.paginationService.wrap(items, totalItems, page, limit);
  }

  @Post('/admin/tahesab/outbox/:id/retry')
  @Roles(UserRole.ADMIN)
  retryOutbox(@Param('id') id: string) {
    return this.prisma.tahesabOutbox.update({
      where: { id },
      data: { status: 'PENDING', nextRetryAt: new Date(), lastError: null },
    });
  }

  @Post('/admin/users/:id/tahesab/resync')
  @Roles(UserRole.ADMIN)
  async resyncUser(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { customerGroup: true } });
    if (!user?.tahesabCustomerCode) throw new Error('TAHESAB_CUSTOMER_CODE_REQUIRED');

    await this.outbox.enqueue('DoEditMoshtari', {
      moshtariCode: user.tahesabCustomerCode,
      name: user.fullName,
      groupName: user.customerGroup?.tahesabGroupName ?? user.customerGroup?.code ?? 'DEFAULT',
      tel: user.mobile,
      address: '',
      nationalCode: '',
      description: '',
    });

    return { queued: true };
  }
}
