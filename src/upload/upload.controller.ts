import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ClientTenantGuard } from '../auth/guards/client-tenant.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
/** WhatsApp Cloud API media limit for video is ~16MB; keep uploads aligned. */
const MAX_VIDEO_FILE_SIZE = 16 * 1024 * 1024;

@Controller('upload')
@UseGuards(JwtAuthGuard, ClientTenantGuard)
export class UploadController {
  constructor(private readonly config: ConfigService) {}

  @Post('images')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, UPLOAD_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname || '') || '';
          const safe = /^\.[a-z0-9]{1,8}$/i.test(ext) ? ext : '';
          cb(null, `${randomUUID()}${safe}`);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) {
      throw new BadRequestException('No files uploaded');
    }
    const invalid = files.filter((f) => !f.mimetype?.startsWith('image/'));
    if (invalid.length > 0) {
      for (const f of files) {
        try {
          unlinkSync(join(UPLOAD_DIR, f.filename));
        } catch {
          /* ignore */
        }
      }
      throw new BadRequestException('Only image files are allowed');
    }

    const base = this.config.getOrThrow<string>('app.publicBaseUrl');
    const urls = files.map((f) => `${base}/uploads/${f.filename}`);
    return { urls };
  }

  @Post('videos')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, UPLOAD_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname || '') || '';
          const safe = /^\.[a-z0-9]{1,8}$/i.test(ext) ? ext : '';
          cb(null, `${randomUUID()}${safe}`);
        },
      }),
      limits: { fileSize: MAX_VIDEO_FILE_SIZE },
    }),
  )
  uploadVideos(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) {
      throw new BadRequestException('No files uploaded');
    }
    const invalid = files.filter((f) => !f.mimetype?.startsWith('video/'));
    if (invalid.length > 0) {
      for (const f of files) {
        try {
          unlinkSync(join(UPLOAD_DIR, f.filename));
        } catch {
          /* ignore */
        }
      }
      throw new BadRequestException('Only video files are allowed');
    }

    const base = this.config.getOrThrow<string>('app.publicBaseUrl');
    const urls = files.map((f) => `${base}/uploads/${f.filename}`);
    return { urls };
  }
}
