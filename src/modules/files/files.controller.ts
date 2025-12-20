import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtRequestUser } from '../auth/jwt.strategy';
import { FileUploadInterceptor } from './file-upload.interceptor';

@ApiTags('files')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) { }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        label: { type: 'string', nullable: true },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileUploadInterceptor)
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
