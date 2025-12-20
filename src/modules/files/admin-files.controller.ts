import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminListFilesQueryDto } from './dto/list-files-query.dto';
import { DeleteFileQueryDto } from './dto/delete-file-query.dto';
import { FilesService } from './files.service';

@ApiTags('admin/files')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/files')
export class AdminFilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  async list(@Query() query: AdminListFilesQueryDto) {
    const { items, total } = await this.filesService.listAdminFiles(query);
    return {
      items: items.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        label: item.label,
        uploadedById: item.uploadedById,
        storageKey: item.storageKey,
      })),
      meta: this.buildMeta(query.page, query.limit, total),
    };
  }

  @Get(':id/meta')
  async meta(@Param('id') id: string, @CurrentUser() user: JwtRequestUser) {
    return this.filesService.getFileMetaAuthorized(id, user);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Query() query: DeleteFileQueryDto) {
    return this.filesService.deleteFileAsAdmin(id, query);
  }

  private buildMeta(page: number, limit: number, total: number) {
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    return { page, limit, total, totalPages };
  }
}
