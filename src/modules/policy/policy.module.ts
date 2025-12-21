import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PolicyResolverService } from './policy-resolver.service';
import { LimitsService } from './limits.service';
import { PolicyMetricsService } from './policy-metrics.service';
import { PeriodKeyService } from './period-key.service';
import { CustomerGroupsAdminController } from './customer-groups.admin.controller';
import { UserKycAdminController } from './user-kyc.admin.controller';
import { EffectivePolicyAdminController } from './effective-policy.admin.controller';
import { PolicyResolutionService } from './policy-resolution.service';
import { PolicyContextBuilder } from './policy-context-builder.service';
import { AdminPolicyRulesController } from './admin-policy-rules.controller';
import { UserProductLimitsAdminController } from './user-product-limits.admin.controller';

@Module({
  imports: [PrismaModule],
  providers: [
    PolicyResolverService,
    LimitsService,
    PolicyMetricsService,
    PeriodKeyService,
    PolicyResolutionService,
    PolicyContextBuilder,
  ],
  controllers: [
    CustomerGroupsAdminController,
    UserKycAdminController,
    EffectivePolicyAdminController,
    AdminPolicyRulesController,
    UserProductLimitsAdminController,
  ],
  exports: [PolicyResolverService, PolicyResolutionService, LimitsService, PolicyMetricsService, PeriodKeyService, PolicyContextBuilder],
})
export class PolicyModule {}
