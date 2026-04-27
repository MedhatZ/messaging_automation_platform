import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import type { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Load env first (match AppConfigModule envFilePath)
  dotenv.config({ path: '.env.local', override: false });
  dotenv.config({ path: '.env', override: false });

  const configService = new ConfigService();
  const redisUrl = process.env.REDIS_URL || configService.get<string>('REDIS_URL');

  if (redisUrl?.trim()) {
    try {
      const { default: Redis } = await import('ioredis');
      const testRedis = new Redis(redisUrl.trim(), {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
      });
      testRedis.on('error', () => {
        // Connection failures are handled by the catch block below.
      });
      await testRedis.connect();
      await testRedis.ping();
      await testRedis.quit();
      process.env.QUEUES_DISABLED = 'false';
      logger.log('Redis connected - QUEUES_ENABLED');
    } catch (error: any) {
      logger.error(`Redis failed: ${error?.message ?? String(error)}`);
      process.env.QUEUES_DISABLED = 'true';
    }
  } else {
    logger.warn('No REDIS_URL - degraded mode');
    process.env.QUEUES_DISABLED = 'true';
  }

  const uploadsRoot = join(process.cwd(), 'uploads');
  mkdirSync(uploadsRoot, { recursive: true });

  // IMPORTANT: import AppModule only after checkRedisConnection() so QUEUES_DISABLED is set early
  // and modules can conditionally skip Bull/Redis initialization.
  const { AppModule } = await import('./app.module.js');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    /** Required for Meta `X-Hub-Signature-256` (HMAC over exact raw JSON bytes). */
    rawBody: true,
  });
  app.useStaticAssets(uploadsRoot, { prefix: '/uploads/' });

  app.enableCors();

  // Increase webhook body limits (Meta payloads can be large).
  // Keep this before app.listen so it applies to all routes.
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        // Preserve exact raw bytes for Meta X-Hub-Signature-256 verification.
        // Note: Nest's `rawBody: true` can be bypassed when overriding body parsers,
        // so we explicitly set it here.
        (req as any).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Webhook request logging (avoid logging full body in production).
  app.use('/whatsapp/webhook', (req: Request, _res: Response, next: NextFunction) => {
    const nowIso = new Date().toISOString();
    const body: any = (req as any).body;
    const phoneNumberId = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    if (process.env.NODE_ENV === 'production') {
      logger.log(
        JSON.stringify({
          category: 'whatsapp_webhook',
          timestamp: nowIso,
          phoneNumberId: typeof phoneNumberId === 'string' ? phoneNumberId : undefined,
        }),
      );
    } else {
      logger.debug(
        JSON.stringify({
          category: 'whatsapp_webhook',
          timestamp: nowIso,
          phoneNumberId: typeof phoneNumberId === 'string' ? phoneNumberId : undefined,
          entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
        }),
      );
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  const appConfig = app.get(ConfigService);
  const port = appConfig.getOrThrow<number>('app.port');

  await app.listen(port);
}

void bootstrap();
