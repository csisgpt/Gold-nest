import { Injectable, Logger } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePriceOverrideDto } from './dto/create-price-override.dto';
import { InvalidOverrideModeException, OverrideExpiredException } from '../../common/exceptions/pricing.exceptions';
import { ListPriceOverridesDto } from './dto/list-price-overrides.dto';
import { runInTx } from '../../common/db/tx.util';

@Injectable()
export class PriceOverridesService {
  private readonly logger = new Logger(PriceOverridesService.name);
  private readonly maxTtlMs = 7 * 24 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  list(query: ListPriceOverridesDto) {
    const where: any = {};
    if (query.productId) where.productId = query.productId;
    if (query.activeOnly === 'true') where.isActive = true;

    return this.prisma.adminPriceOverride.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private validateDto(dto: CreatePriceOverrideDto) {
    if (dto.mode === 'ABSOLUTE' && (dto.buyAbsolute == null || dto.sellAbsolute == null)) {
      throw new InvalidOverrideModeException('Absolute overrides require buyAbsolute and sellAbsolute');
    }
    if (dto.mode === 'DELTA_BPS' && (dto.buyDeltaBps == null || dto.sellDeltaBps == null)) {
      throw new InvalidOverrideModeException('Delta BPS overrides require buyDeltaBps and sellDeltaBps');
    }
    if (dto.mode === 'DELTA_AMOUNT' && (dto.buyDeltaAmount == null || dto.sellDeltaAmount == null)) {
      throw new InvalidOverrideModeException('Delta amount overrides require buyDeltaAmount and sellDeltaAmount');
    }

    const expiresAt = new Date(dto.expiresAt);
    const now = Date.now();
    if (expiresAt.getTime() <= now) {
      throw new OverrideExpiredException('expiresAt must be in the future');
    }
    if (expiresAt.getTime() - now > this.maxTtlMs) {
      throw new OverrideExpiredException('Override TTL exceeds allowed window');
    }
  }

  async create(dto: CreatePriceOverrideDto, adminId: string) {
    this.validateDto(dto);
    const expiresAt = new Date(dto.expiresAt);

    return runInTx(this.prisma, async (tx) => {
      if (dto.replaceExisting !== false) {
        await tx.adminPriceOverride.updateMany({
          where: { productId: dto.productId, isActive: true },
          data: { isActive: false, revokedAt: new Date(), revokedByAdminId: adminId },
        });
      } else {
        const active = await tx.adminPriceOverride.findFirst({
          where: { productId: dto.productId, isActive: true },
        });
        if (active) {
          throw new InvalidOverrideModeException('Active override exists; set replaceExisting to true to replace it');
        }
      }

      this.logger.log(`Creating price override for product ${dto.productId} by admin ${adminId}`);
      return tx.adminPriceOverride.create({
        data: {
          productId: dto.productId,
          mode: dto.mode,
          buyAbsolute: dto.buyAbsolute != null ? new Decimal(dto.buyAbsolute) : undefined,
          sellAbsolute: dto.sellAbsolute != null ? new Decimal(dto.sellAbsolute) : undefined,
          buyDeltaBps: dto.buyDeltaBps ?? undefined,
          sellDeltaBps: dto.sellDeltaBps ?? undefined,
          buyDeltaAmount: dto.buyDeltaAmount != null ? new Decimal(dto.buyDeltaAmount) : undefined,
          sellDeltaAmount: dto.sellDeltaAmount != null ? new Decimal(dto.sellDeltaAmount) : undefined,
          expiresAt,
          reason: dto.reason,
          createdByAdminId: adminId,
          isActive: true,
        },
      });
    });
  }

  async revoke(id: string, adminId: string) {
    this.logger.log(`Revoking override ${id} by admin ${adminId}`);
    return this.prisma.adminPriceOverride.update({
      where: { id },
      data: { isActive: false, revokedAt: new Date(), revokedByAdminId: adminId },
    });
  }
}
