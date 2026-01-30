import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import {
  AdminDestinationQueryDto,
  CreatePaymentDestinationDto,
  CreateSystemDestinationDto,
  PaymentDestinationViewDto,
  UpdatePaymentDestinationDto,
} from './dto/payment-destination.dto';
import { PaymentDestinationsService } from './payment-destinations.service';

@ApiTags('payment-destinations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class PaymentDestinationsController {
  constructor(private readonly destinationsService: PaymentDestinationsService) {}

  @Get('me/payout-destinations')
  @ApiOkResponse({ type: [PaymentDestinationViewDto] })
  listMyPayoutDestinations(@CurrentUser() user: JwtRequestUser) {
    return this.destinationsService.listUserPayoutDestinations(user.id);
  }

  @Post('me/payout-destinations')
  @ApiOkResponse({ type: PaymentDestinationViewDto })
  createMyPayoutDestination(@CurrentUser() user: JwtRequestUser, @Body() dto: CreatePaymentDestinationDto) {
    return this.destinationsService.createUserPayoutDestination(user.id, dto);
  }

  @Patch('me/payout-destinations/:id')
  @ApiOkResponse({ type: PaymentDestinationViewDto })
  updateMyPayoutDestination(
    @CurrentUser() user: JwtRequestUser,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDestinationDto,
  ) {
    return this.destinationsService.updateUserPayoutDestination(user.id, id, dto);
  }

  @Post('me/payout-destinations/:id/make-default')
  @ApiOkResponse({ type: PaymentDestinationViewDto })
  makeDefault(@CurrentUser() user: JwtRequestUser, @Param('id') id: string) {
    return this.destinationsService.makeDefault(user.id, id);
  }

  @Get('admin/destinations')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: [PaymentDestinationViewDto] })
  listAdminDestinations(@Query() query: AdminDestinationQueryDto) {
    return this.destinationsService.listAdminDestinations(query.direction);
  }

  @Post('admin/destinations/system')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: PaymentDestinationViewDto })
  createSystemDestination(@Body() dto: CreateSystemDestinationDto) {
    return this.destinationsService.createSystemCollectionDestination(dto);
  }
}
