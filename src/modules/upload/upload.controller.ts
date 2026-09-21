import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { UploadService, UploadedFile } from './upload.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { BypassTransform } from '../../common/decorators/bypass-transform.decorator.js';
import { Attachment } from './entities/attachment.entity.js';

@ApiTags('附件管理')
@ApiBearerAuth()
@Controller('uploads')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @ApiOperation({ summary: '上传附件（多文件）' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: '附件上传成功' })
  @UseInterceptors(FilesInterceptor('files'))
  async uploadFiles(
    @CurrentUser('sub') userId: string,
    @UploadedFiles() files: Array<UploadedFile>,
  ) {
    return this.uploadService.uploadFiles(userId, files);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取附件元数据' })
  @ApiResponse({ status: 200, description: '附件元数据' })
  async getMetadata(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<Attachment> {
    return this.uploadService.getAttachmentMetadata(userId, id);
  }

  @Get(':id/download')
  @BypassTransform()
  @ApiOperation({ summary: '下载附件文件流' })
  @ApiResponse({ status: 200, description: '附件文件流' })
  async downloadFile(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const attachment = await this.uploadService.getAttachmentMetadata(
      userId,
      id,
    );

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
    );
    res.setHeader('Content-Length', attachment.size);

    const stream = fs.createReadStream(path.resolve(attachment.storagePath));
    stream.pipe(res);
  }
}
