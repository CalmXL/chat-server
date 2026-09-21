import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity.js';
import { UploadController } from './upload.controller.js';
import { UploadService } from './upload.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment])],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService, TypeOrmModule],
})
export class UploadModule {}
