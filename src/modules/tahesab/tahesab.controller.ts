import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TahesabService } from './tahesab.service';
import { DoListMoshtariRequestDto } from './dto/moshtari.dto';
import { GetMandeHesabByCodeRequestDto } from './dto/customer-balance.dto';
import { DoListAsnadRequestDto } from './dto/list-documents.dto';

@ApiTags('Tahesab')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tahesab')
export class TahesabController {
  constructor(private readonly tahesabService: TahesabService) {}

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

}
