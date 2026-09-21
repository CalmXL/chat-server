import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PDFParse } from 'pdf-parse';
import { Attachment } from './entities/attachment.entity.js';
import { AttachmentKind } from '../../common/enums/index.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import {
  ErrorCode,
  ErrorMessages,
} from '../../common/constants/error-codes.js';

export interface UploadedFile {
  fieldname?: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadResult {
  attachmentIds: string[];
  attachments: Attachment[];
}

const IMAGE_EXTENSIONS: Record<string, true> = {
  '.jpg': true,
  '.jpeg': true,
  '.png': true,
  '.webp': true,
  '.gif': true,
};
const IMAGE_MIMES: Record<string, true> = {
  'image/jpeg': true,
  'image/png': true,
  'image/webp': true,
  'image/gif': true,
};

const DOC_EXTENSIONS: Record<string, true> = {
  '.pdf': true,
  '.txt': true,
  '.md': true,
};
const DOC_MIMES: Record<string, true> = {
  'application/pdf': true,
  'text/plain': true,
  'text/markdown': true,
  'text/x-markdown': true,
};

@Injectable()
export class UploadService {
  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepo: Repository<Attachment>,
    private readonly configService: ConfigService,
  ) {}

  private getFileKind(
    filename: string,
    mimetype: string,
  ): { kind: AttachmentKind; ext: string } | null {
    const ext = path.extname(filename).toLowerCase();
    if (IMAGE_EXTENSIONS[ext]) {
      return { kind: AttachmentKind.IMAGE, ext };
    }
    if (DOC_EXTENSIONS[ext]) {
      return { kind: AttachmentKind.DOCUMENT, ext };
    }
    if (IMAGE_MIMES[mimetype.toLowerCase()]) {
      return { kind: AttachmentKind.IMAGE, ext: ext || '.png' };
    }
    if (DOC_MIMES[mimetype.toLowerCase()]) {
      return { kind: AttachmentKind.DOCUMENT, ext: ext || '.txt' };
    }
    return null;
  }

  async extractText(
    buffer: Buffer,
    ext: string,
    mimetype: string,
  ): Promise<string> {
    if (ext === '.pdf' || mimetype === 'application/pdf') {
      try {
        const parser = new PDFParse({ data: buffer }) as unknown as {
          load(): Promise<void>;
          getText(): Promise<{ text?: string }>;
        };
        await parser.load();
        const res = await parser.getText();
        return res.text || '';
      } catch {
        throw new BusinessException(
          ErrorCode.UPLOAD_TEXT_EXTRACT_FAILED,
          ErrorMessages[ErrorCode.UPLOAD_TEXT_EXTRACT_FAILED],
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    try {
      return buffer.toString('utf-8');
    } catch {
      throw new BusinessException(
        ErrorCode.UPLOAD_TEXT_EXTRACT_FAILED,
        ErrorMessages[ErrorCode.UPLOAD_TEXT_EXTRACT_FAILED],
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async uploadFiles(
    userId: string,
    files: Array<UploadedFile>,
  ): Promise<UploadResult> {
    if (!files || files.length === 0) {
      throw new BusinessException(
        ErrorCode.VALIDATION_FAILED,
        '请至少选择一个文件上传',
        HttpStatus.BAD_REQUEST,
      );
    }

    const maxUploadMb =
      this.configService.get<number>('ai.maxUploadMb') || 10;
    const maxSizeBytes = maxUploadMb * 1024 * 1024;
    const uploadDir =
      this.configService.get<string>('ai.uploadDir') || './uploads';

    // 1. Validation pass: validate types and sizes
    const fileSpecs: Array<{
      file: UploadedFile;
      kind: AttachmentKind;
      ext: string;
    }> = [];

    for (const file of files) {
      if (file.size > maxSizeBytes) {
        throw new BusinessException(
          ErrorCode.UPLOAD_TOO_LARGE,
          ErrorMessages[ErrorCode.UPLOAD_TOO_LARGE],
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      }

      const fileKindInfo = this.getFileKind(file.originalname, file.mimetype);
      if (!fileKindInfo) {
        throw new BusinessException(
          ErrorCode.UPLOAD_TYPE_NOT_ALLOWED,
          ErrorMessages[ErrorCode.UPLOAD_TYPE_NOT_ALLOWED],
          HttpStatus.BAD_REQUEST,
        );
      }

      fileSpecs.push({
        file,
        kind: fileKindInfo.kind,
        ext: fileKindInfo.ext,
      });
    }

    // 2. Synchronous text extraction & storage with rollback
    await fs.mkdir(uploadDir, { recursive: true });
    const createdFilePaths: string[] = [];
    const attachmentsToSave: Attachment[] = [];

    try {
      for (const spec of fileSpecs) {
        let extractedText: string | null = null;
        if (spec.kind === AttachmentKind.DOCUMENT) {
          extractedText = await this.extractText(
            spec.file.buffer,
            spec.ext,
            spec.file.mimetype,
          );
        }

        const uniqueFilename = `${crypto.randomUUID()}${spec.ext}`;
        const storagePath = path.join(uploadDir, uniqueFilename);

        await fs.writeFile(storagePath, spec.file.buffer);
        createdFilePaths.push(storagePath);

        const attachment = this.attachmentRepo.create({
          uploaderId: userId,
          messageId: null,
          kind: spec.kind,
          filename: spec.file.originalname,
          storagePath,
          mimeType: spec.file.mimetype,
          size: spec.file.size,
          extractedText,
        });

        attachmentsToSave.push(attachment);
      }

      const savedAttachments =
        await this.attachmentRepo.save(attachmentsToSave);
      return {
        attachmentIds: savedAttachments.map((a) => a.id),
        attachments: savedAttachments,
      };
    } catch (err) {
      // Clean up files on disk on error
      for (const filePath of createdFilePaths) {
        try {
          await fs.unlink(filePath);
        } catch {
          // ignore
        }
      }
      throw err;
    }
  }

  async getAttachmentMetadata(
    userId: string,
    attachmentId: string,
  ): Promise<Attachment> {
    const attachment = await this.attachmentRepo.findOne({
      where: { id: attachmentId, uploaderId: userId },
    });
    if (!attachment) {
      throw new BusinessException(
        ErrorCode.ATTACHMENT_NOT_FOUND,
        ErrorMessages[ErrorCode.ATTACHMENT_NOT_FOUND],
        HttpStatus.NOT_FOUND,
      );
    }
    return attachment;
  }
}
