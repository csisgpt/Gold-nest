import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { TradeStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EffectiveSettingsService } from '../../user-settings/effective-settings.service';
import { JwtRequestUser } from '../../auth/jwt.strategy';

@Injectable()
export class TradeAccessGuard implements CanActivate {
  constructor(
    private readonly effectiveSettings: EffectiveSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtRequestUser }>();
    const user = request.user;
    if (!user) {
      return false;
    }

    const settings = await this.effectiveSettings.getEffective(user.id);
    if (!settings.tradeEnabled) {
      throw new ForbiddenException({
        code: 'USER_TRADE_DISABLED',
        message: 'Trading is disabled for your account',
      });
    }

    if (settings.maxOpenTrades != null) {
      const openStatuses: TradeStatus[] = [TradeStatus.PENDING, TradeStatus.APPROVED];
      const activeTrades = await this.prisma.trade.count({
        where: { clientId: user.id, status: { in: openStatuses } },
      });

      if (activeTrades >= settings.maxOpenTrades) {
        throw new ConflictException({
          code: 'MAX_OPEN_TRADES_REACHED',
          message: 'You have reached your maximum number of open trades',
        });
      }
    }

    return true;
  }
}
