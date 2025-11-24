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
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { promises as fs } from 'fs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('files')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: any,
    @Body() dto: UploadFileDto,
  ) {
    return this.filesService.storeFile(file, dto.uploadedById, dto.label);
  }

  @Get(':id')
  async serve(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.filesService.getFile(id);
    const absolutePath = this.filesService.getAbsolutePath(file.storageKey);
    const data = await fs.readFile(absolutePath);
    res.contentType(file.mimeType);
    return new StreamableFile(data);
  }
}
