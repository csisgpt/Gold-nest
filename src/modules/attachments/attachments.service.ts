import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttachmentEntityType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtRequestUser } from '../auth/jwt.strategy';

@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForEntityAuthorized(
    actor: JwtRequestUser,
    entityType: AttachmentEntityType,
    entityId: string,
  ) {
    if (actor.role !== UserRole.ADMIN) {
      await this.assertActorOwnsEntity(actor.id, entityType, entityId);
    }

    return this.prisma.attachment.findMany({
      where: { entityType, entityId },
      include: { file: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async assertActorOwnsEntity(
    actorId: string,
    entityType: AttachmentEntityType,
    entityId: string,
  ) {
    if (entityType === AttachmentEntityType.DEPOSIT) {
      const deposit = await this.prisma.depositRequest.findUnique({
        where: { id: entityId },
        select: { userId: true },
      });
      if (!deposit) throw new NotFoundException('Deposit not found');
      if (deposit.userId !== actorId) throw new ForbiddenException('Forbidden');
      return;
    }

    if (entityType === AttachmentEntityType.WITHDRAW) {
      const withdrawal = await this.prisma.withdrawRequest.findUnique({
        where: { id: entityId },
        select: { userId: true },
      });
      if (!withdrawal) throw new NotFoundException('Withdraw request not found');
      if (withdrawal.userId !== actorId) throw new ForbiddenException('Forbidden');
      return;
    }

    if (entityType === AttachmentEntityType.TRADE) {
      const trade = await this.prisma.trade.findUnique({
        where: { id: entityId },
        select: { clientId: true },
      });
      if (!trade) throw new NotFoundException('Trade not found');
      if (trade.clientId !== actorId) throw new ForbiddenException('Forbidden');
      return;
    }

    if (entityType === AttachmentEntityType.GOLD_LOT) {
      const lot = await this.prisma.goldLot.findUnique({
        where: { id: entityId },
        select: { userId: true },
      });
      if (!lot) throw new NotFoundException('Gold lot not found');
      if (lot.userId !== actorId) throw new ForbiddenException('Forbidden');
      return;
    }

    if (entityType === AttachmentEntityType.REMITTANCE) {
      const remittance = await this.prisma.remittance.findUnique({
        where: { id: entityId },
        select: {
          fromUserId: true,
          toUserId: true,
          group: { select: { createdByUserId: true } },
        },
      });
      if (!remittance) throw new NotFoundException('Remittance not found');
      if (
        remittance.fromUserId !== actorId &&
        remittance.toUserId !== actorId &&
        remittance.group?.createdByUserId !== actorId
      ) {
        throw new ForbiddenException('Forbidden');
      }
    }
  }
}
