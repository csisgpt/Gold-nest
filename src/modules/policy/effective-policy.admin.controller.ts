import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PolicyResolverService } from './policy-resolver.service';

@ApiTags('admin-effective-policy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller()
export class EffectivePolicyAdminController {
  constructor(private readonly policyResolver: PolicyResolverService) {}

  @Get('admin/users/:id/effective-policy')
  async get(@Param('id') id: string) {
    const effective = await this.policyResolver.getEffectiveRules(id);
    return {
      user: { id: effective.user.id, fullName: effective.user.fullName, mobile: effective.user.mobile },
      customerGroup: effective.customerGroup,
      kyc: effective.userKyc,
      rules: effective.rules,
    };
  }
}
