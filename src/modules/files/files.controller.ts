import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
} from '@nestjs/swagger';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { FileUploadInterceptor } from './file-upload.interceptor';
import { SkipResponseWrap } from '../../common/decorators/skip-wrap.decorator';
import { ListFilesQueryDto } from './dto/list-files-query.dto';
import { UserRole } from '@prisma/client';

@ApiTags('files')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  async listMyFiles(@Query() query: ListFilesQueryDto, @CurrentUser() user: JwtRequestUser) {
    const { items, total } = await this.filesService.listMyFiles(user.id, query);
    return {
      items: items.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        label: item.label,
      })),
      meta: this.buildMeta(query.page, query.limit, total),
    };
  }

  @Get(':id/meta')
  async getMeta(@Param('id') id: string, @CurrentUser() user: JwtRequestUser) {
    const meta = await this.filesService.getFileMetaAuthorized(id, user);
    if (user.role !== UserRole.ADMIN) {
      const { uploadedById, storageKey, ...rest } = meta as any;
      return rest;
    }
    return meta;
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, label: { type: 'string' } } } })
  @UseInterceptors(FileUploadInterceptor)
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: JwtRequestUser,
  ) {
    return this.filesService.storeFile(file, user.id, dto.label);
  }

  @Get(':id')
  @SkipResponseWrap()
  async serve(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: JwtRequestUser,
  ) {
    const file = await this.filesService.getFileAuthorized(id, user);
    const { stream, contentLength } = await this.filesService.getFileStream(
      file.storageKey,
    );
    res.contentType(file.mimeType);
    if (contentLength !== undefined) {
      res.setHeader('Content-Length', contentLength.toString());
    }
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    return new StreamableFile(stream);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: JwtRequestUser) {
    return this.filesService.deleteFileAsUser(id, user);
  }

  private buildMeta(page: number, limit: number, total: number) {
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    return { page, limit, total, totalPages };
  }
}
