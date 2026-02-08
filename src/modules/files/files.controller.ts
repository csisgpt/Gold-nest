import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { FileUploadInterceptor } from './file-upload.interceptor';
import { SkipWrap } from '../../common/decorators/skip-wrap.decorator';
import { ListFilesQueryDto } from './dto/list-files-query.dto';
import { UserRole } from '@prisma/client';
import { FileDownloadLinkDto } from './dto/file-download-link.dto';
import { PaginationService } from '../../common/pagination/pagination.service';

@ApiTags('files')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('files')
@ApiExtraModels(FileDownloadLinkDto)
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly paginationService: PaginationService,
  ) {}

  @Get()
  async listMyFiles(@Query() query: ListFilesQueryDto, @CurrentUser() user: JwtRequestUser) {
    const { page, limit } = this.paginationService.resolvePaging({
      page: query.page,
      limit: query.limit,
      offset: query.offset,
    });
    query.page = page;
    query.limit = limit;
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
      meta: this.paginationService.meta(total, page, limit),
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
  @ApiOperation({ summary: 'Get a download link for a file (JSON contract)' })
  @ApiOkResponse({
    description: 'Download link payload',
    type: FileDownloadLinkDto,
    content: {
      'application/json': {
        examples: {
          raw: {
            summary: 'Raw local download',
            value: {
              id: 'file-id',
              name: 'document.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1024,
              label: 'Invoice',
              method: 'raw',
              previewUrl:
                'https://api.example.com/files/file-id/raw?disposition=inline',
              downloadUrl:
                'https://api.example.com/files/file-id/raw?disposition=attachment',
              url: 'https://api.example.com/files/file-id/raw?disposition=attachment',
            },
          },
          presigned: {
            summary: 'S3 presigned URL',
            value: {
              id: 'file-id',
              name: 'photo.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 2048,
              label: null,
              method: 'presigned',
              expiresInSeconds: 60,
              previewUrl: 'https://storage.example.com/presigned-inline-url',
              downloadUrl: 'https://storage.example.com/presigned-attachment-url',
              url: 'https://storage.example.com/presigned-attachment-url',
            },
          },
        },
      },
    },
  })
  async getFileLinks(
    @Param('id') id: string,
    @CurrentUser() user: JwtRequestUser,
    @Req() req: Request,
  ) {
    return this.filesService.getFileLinksAuthorized(id, user, req);
  }

  @Get(':id/raw')
  @SkipWrap()
  @ApiOperation({ summary: 'Raw file download (binary stream)' })
  @ApiProduces('application/octet-stream')
  async serveRaw(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() user: JwtRequestUser,
    @Query('disposition') disposition?: 'inline' | 'attachment',
  ) {
    const file = await this.filesService.getFileAuthorized(id, user);
    const { stream, contentLength } = await this.filesService.getFileStream(
      file.storageKey,
    );
    res.contentType(file.mimeType);
    if (contentLength !== undefined) {
      res.setHeader('Content-Length', contentLength.toString());
    }
    const resolvedDisposition =
      disposition === 'inline' || disposition === 'attachment'
        ? disposition
        : 'attachment';
    res.setHeader(
      'Content-Disposition',
      `${resolvedDisposition}; filename="${encodeURIComponent(file.fileName)}"`,
    );

    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500);
      }
      res.end();
    });

    res.on('close', () => {
      if (!res.writableEnded) {
        stream.destroy();
      }
    });

    stream.pipe(res);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: JwtRequestUser) {
    return this.filesService.deleteFileAsUser(id, user);
  }

}
