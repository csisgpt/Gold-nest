import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateCustomerGroupDto, UpdateCustomerGroupDto } from './dto/customer-group.dto';
import { runInTx } from '../../common/db/tx.util';

@ApiTags('admin-customer-groups')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller()
export class CustomerGroupsAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('admin/customer-groups')
  list() {
    return this.prisma.customerGroup.findMany({ orderBy: { code: 'asc' } });
  }

  @Post('admin/customer-groups')
  create(@Body() dto: CreateCustomerGroupDto) {
    return runInTx(this.prisma, async (tx) => {
      if (dto.isDefault) {
        await tx.customerGroup.updateMany({ data: { isDefault: false } });
      }

      return tx.customerGroup.create({
        data: {
          code: dto.code,
          name: dto.name,
          tahesabGroupName: dto.tahesabGroupName,
          isDefault: dto.isDefault ?? false,
        },
      });
    });
  }

  @Put('admin/customer-groups/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerGroupDto) {
    return runInTx(this.prisma, async (tx) => {
      if (dto.isDefault) {
        await tx.customerGroup.updateMany({ data: { isDefault: false } });
      }

      return tx.customerGroup.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          tahesabGroupName: dto.tahesabGroupName,
          isDefault: dto.isDefault ?? undefined,
        },
      });
    });
  }
}
