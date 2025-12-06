import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateRemittanceDto } from './dto/create-remittance.dto';
import { RemittancesService } from './remittances.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { CreateMultiLegRemittanceDto } from './dto/create-multi-leg-remittance.dto';
import { RemittanceGroupResponseDto } from './dto/remittance-group-response.dto';
import { RemittanceDetailsResponseDto } from './dto/remittance-details-response.dto';
import { OpenRemittanceSummaryDto } from './dto/open-remittance-summary.dto';

@ApiTags('remittances')
@ApiBearerAuth('access-token')
@Controller()
export class RemittancesController {
  constructor(private readonly remittancesService: RemittancesService) {}

  @Post('remittances')
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateRemittanceDto, @CurrentUser() user: JwtRequestUser) {
    return this.remittancesService.createForUser(user.id, dto);
  }

  @Get('remittances/my')
  @UseGuards(JwtAuthGuard)
  async listMy(@CurrentUser() user: JwtRequestUser) {
    return this.remittancesService.findByUser(user.id);
  }

  @Get('remittances/my/open')
  @UseGuards(JwtAuthGuard)
  async listMyOpenObligations(
    @CurrentUser() user: JwtRequestUser,
  ): Promise<OpenRemittanceSummaryDto[]> {
    return this.remittancesService.findOpenObligationsForUser(user.id);
  }

  @Get('remittances/:id')
  @UseGuards(JwtAuthGuard)
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: JwtRequestUser,
  ): Promise<RemittanceDetailsResponseDto> {
    return this.remittancesService.findOneWithSettlementsForUser(id, user.id);
  }

  @Post('remittances/groups')
  @UseGuards(JwtAuthGuard)
  async createGroup(
    @Body() dto: CreateMultiLegRemittanceDto,
    @CurrentUser() user: JwtRequestUser,
  ): Promise<RemittanceGroupResponseDto> {
    return this.remittancesService.createGroupForUser(user.id, dto);
  }

  @Get('remittances/groups/my')
  @UseGuards(JwtAuthGuard)
  async listMyGroups(@CurrentUser() user: JwtRequestUser): Promise<RemittanceGroupResponseDto[]> {
    return this.remittancesService.findGroupsByUser(user.id);
  }
}
