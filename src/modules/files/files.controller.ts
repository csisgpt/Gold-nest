import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  BadRequestException,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { Request } from 'express';

const fileInterceptorOptions = (() => {
  const maxSizeRaw = process.env.FILE_MAX_SIZE_BYTES;
  const maxSize = maxSizeRaw ? Number(maxSizeRaw) : undefined;
  const allowed = process.env.FILE_ALLOWED_MIME?.split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  return {
    limits: maxSize ? { fileSize: maxSize } : undefined,
    fileFilter: (_req: Request, file: Express.Multer.File, cb: any) => {
      if (allowed && allowed.length > 0 && !allowed.includes(file.mimetype)) {
        return cb(new BadRequestException('MIME type not allowed'), false);
      }
      cb(null, true);
    },
  };
})();

@ApiTags('files')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', fileInterceptorOptions))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: JwtRequestUser,
  ) {
    return this.filesService.storeFile(file, user.id, dto.label);
  }

  @Get(':id')
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
}
