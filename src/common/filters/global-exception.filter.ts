import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const isHttp = exception instanceof HttpException;
    const isProd = process.env.NODE_ENV === 'production';

    let body: Record<string, unknown> | string;
    if (isHttp) {
      const r = exception.getResponse();
      body =
        typeof r === 'string'
          ? { message: r, error: exception.name }
          : { ...(r as Record<string, unknown>) };
    } else {
      body = {
        message: isProd
          ? 'Internal server error'
          : exception instanceof Error
            ? exception.message
            : 'Unknown error',
        error: 'InternalServerError',
      };
    }

    const msgForLog =
      typeof body.message === 'string'
        ? body.message
        : Array.isArray(body.message)
          ? body.message.join('; ')
          : JSON.stringify(body);

    this.logger.warn(
      JSON.stringify({
        category: 'http_error',
        method: req.method,
        path: req.url,
        status,
        message: msgForLog,
      }),
    );

    if (status === 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload =
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : { message: body };

    res.status(status).json({
      ...payload,
      statusCode: status,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
