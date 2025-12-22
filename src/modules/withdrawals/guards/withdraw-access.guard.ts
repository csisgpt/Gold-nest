import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { EffectiveSettingsService } from '../../user-settings/effective-settings.service';
import { JwtRequestUser } from '../../auth/jwt.strategy';

@Injectable()
export class WithdrawAccessGuard implements CanActivate {
  constructor(private readonly effectiveSettings: EffectiveSettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtRequestUser }>();
    const user = request.user;
    if (!user) return false;

    const settings = await this.effectiveSettings.getEffective(user.id);
    if (!settings.withdrawEnabled) {
      throw new ForbiddenException({
        code: 'USER_WITHDRAW_DISABLED',
        message: 'Withdrawals are disabled for your account',
      });
    }

    return true;
  }
}
