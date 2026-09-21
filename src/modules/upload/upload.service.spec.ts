import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { UploadService } from './upload.service.js';
import { Attachment } from './entities/attachment.entity.js';
import { AttachmentKind } from '../../common/enums/index.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { ErrorCode } from '../../common/constants/error-codes.js';

describe('UploadService', () => {
  let service: UploadService;
  let attachmentRepo: Repository<Attachment>;
  let configService: ConfigService;
  let tempUploadDir: string;

  const userId = 'user-test-1';
  const otherUserId = 'user-test-2';

  beforeEach(async () => {
    tempUploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-test-'));

    configService = {
      get: (key: string) => {
        if (key === 'ai.maxUploadMb') return 10;
        if (key === 'ai.uploadDir') return tempUploadDir;
        return null;
      },
    } as unknown as ConfigService;

    attachmentRepo = {
      create: vi.fn((dto) => ({
        id: crypto.randomUUID(),
        createdAt: new Date(),
        ...dto,
      })),
      save: vi.fn(async (entities) => entities),
      findOne: vi.fn(async () => null),
    } as unknown as Repository<Attachment>;

    service = new UploadService(attachmentRepo, configService);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempUploadDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('uploadFiles & Text Extraction', () => {
    it('should successfully upload an image and a text document', async () => {
      const mockImageFile = {
        originalname: 'photo.png',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from('fake-png-binary-data'),
      } as Express.Multer.File;

      const mockTextFile = {
        originalname: 'notes.md',
        mimetype: 'text/markdown',
        size: 256,
        buffer: Buffer.from('# Hello Markdown\nThis is content.'),
      } as Express.Multer.File;

      const result = await service.uploadFiles(userId, [
        mockImageFile,
        mockTextFile,
      ]);

      expect(result.attachmentIds).toHaveLength(2);
      expect(result.attachments).toHaveLength(2);

      const [imgAtt, docAtt] = result.attachments;
      expect(imgAtt.kind).toBe(AttachmentKind.IMAGE);
      expect(imgAtt.extractedText).toBeNull();
      expect(imgAtt.uploaderId).toBe(userId);

      expect(docAtt.kind).toBe(AttachmentKind.DOCUMENT);
      expect(docAtt.extractedText).toBe('# Hello Markdown\nThis is content.');
      expect(docAtt.uploaderId).toBe(userId);
    });

    it('should reject file types not in whitelist with 40011 UPLOAD_TYPE_NOT_ALLOWED', async () => {
      const mockExeFile = {
        originalname: 'virus.exe',
        mimetype: 'application/x-msdownload',
        size: 500,
        buffer: Buffer.from('exe'),
      } as Express.Multer.File;

      try {
        await service.uploadFiles(userId, [mockExeFile]);
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect((err as BusinessException).code).toBe(
          ErrorCode.UPLOAD_TYPE_NOT_ALLOWED,
        );
      }
    });

    it('should reject file exceeding AI_MAX_UPLOAD_MB with 41301 UPLOAD_TOO_LARGE', async () => {
      const oversizedFile = {
        originalname: 'huge.png',
        mimetype: 'image/png',
        size: 11 * 1024 * 1024, // 11MB > 10MB
        buffer: Buffer.alloc(100),
      } as Express.Multer.File;

      try {
        await service.uploadFiles(userId, [oversizedFile]);
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect((err as BusinessException).code).toBe(
          ErrorCode.UPLOAD_TOO_LARGE,
        );
      }
    });

    it('should reject invalid PDF with 40012 UPLOAD_TEXT_EXTRACT_FAILED and clean up files', async () => {
      const corruptPdf = {
        originalname: 'corrupt.pdf',
        mimetype: 'application/pdf',
        size: 100,
        buffer: Buffer.from('not a valid pdf content'),
      } as Express.Multer.File;

      try {
        await service.uploadFiles(userId, [corruptPdf]);
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect((err as BusinessException).code).toBe(
          ErrorCode.UPLOAD_TEXT_EXTRACT_FAILED,
        );
      }

      // Check no leftover files in directory
      const filesInDir = await fs.readdir(tempUploadDir);
      expect(filesInDir).toHaveLength(0);
    });
  });

  describe('getAttachmentMetadata', () => {
    it('should return metadata when owned by user', async () => {
      const mockAtt = {
        id: 'att-1',
        uploaderId: userId,
        filename: 'file.txt',
      } as Attachment;

      vi.mocked(attachmentRepo.findOne).mockResolvedValue(mockAtt);

      const res = await service.getAttachmentMetadata(userId, 'att-1');
      expect(res).toBe(mockAtt);
    });

    it('should throw 40402 ATTACHMENT_NOT_FOUND when not found or owned by other', async () => {
      vi.mocked(attachmentRepo.findOne).mockResolvedValue(null);

      try {
        await service.getAttachmentMetadata(otherUserId, 'att-1');
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect((err as BusinessException).code).toBe(
          ErrorCode.ATTACHMENT_NOT_FOUND,
        );
      }
    });
  });
});
