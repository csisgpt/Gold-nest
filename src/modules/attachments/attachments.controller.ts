import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ListAttachmentsQueryDto } from './dto/list-attachments-query.dto';
import { AttachmentsService } from './attachments.service';

@ApiTags('attachments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get('attachments')
  async list(
    @Query() query: ListAttachmentsQueryDto,
    @CurrentUser() user: JwtRequestUser,
  ) {
    const items = await this.attachmentsService.listForEntityAuthorized(
      user,
      query.entityType,
      query.entityId,
    );

    return {
      items: items.map((item) => ({
        id: item.id,
        fileId: item.fileId,
        entityType: item.entityType,
        entityId: item.entityId,
        createdAt: item.createdAt,
        file: {
          id: item.file.id,
          fileName: item.file.fileName,
          mimeType: item.file.mimeType,
          sizeBytes: item.file.sizeBytes,
          label: item.file.label,
        },
      })),
    };
  }

  @Get('admin/attachments')
  @Roles(UserRole.ADMIN)
  async listAdmin(@Query() query: ListAttachmentsQueryDto, @CurrentUser() user: JwtRequestUser) {
    const items = await this.attachmentsService.listForEntityAuthorized(
      user,
      query.entityType,
      query.entityId,
    );

    return {
      items: items.map((item) => ({
        id: item.id,
        fileId: item.fileId,
        entityType: item.entityType,
        entityId: item.entityId,
        createdAt: item.createdAt,
        file: {
          id: item.file.id,
          fileName: item.file.fileName,
          mimeType: item.file.mimeType,
          sizeBytes: item.file.sizeBytes,
          label: item.file.label,
          uploadedById: item.file.uploadedById,
          storageKey: item.file.storageKey,
        },
      })),
    };
  }
}
