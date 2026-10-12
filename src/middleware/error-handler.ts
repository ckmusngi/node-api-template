import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import {
  ConnectionError,
  ForeignKeyConstraintError,
  UniqueConstraintError,
  ValidationError as SequelizeValidationError,
} from 'sequelize';
import { ZodError } from 'zod';
import { isProduction } from '../config/env';
import { ApiResponse } from '../utils/api-response';
import { AppError, ErrorCode } from '../utils/app-error';
import { HttpStatus } from '../utils/http-status';
import { formatZodIssues } from './validate';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `Route ${req.method} ${req.path} not found`));
};

/** Maps known library errors to AppErrors so clients get consistent, safe responses. */
function normalize(err: unknown): AppError | null {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return AppError.validation(formatZodIssues(err.issues));
  if (err instanceof UniqueConstraintError) {
    return AppError.conflict(
      `A record with this ${Object.keys(err.fields ?? {}).join(', ') || 'value'} already exists`,
    );
  }
  if (err instanceof ForeignKeyConstraintError)
    return AppError.conflict('Referenced record does not exist or is still in use');
  if (err instanceof SequelizeValidationError) {
    return AppError.validation(err.errors.map((e) => ({ path: e.path ?? '', message: e.message })));
  }
  if (err instanceof ConnectionError) {
    return new AppError(
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.SERVICE_UNAVAILABLE,
      'Service temporarily unavailable',
    );
  }
  if (err instanceof MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? new AppError(HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.PAYLOAD_TOO_LARGE, 'File is too large')
      : AppError.badRequest(err.message);
  }
  const bodyParserError = err as { type?: string; status?: number };
  if (bodyParserError?.type === 'entity.parse.failed') return AppError.badRequest('Malformed JSON body');
  if (bodyParserError?.type === 'entity.too.large') {
    return new AppError(HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.PAYLOAD_TOO_LARGE, 'Request body is too large');
  }
  if (bodyParserError?.type === 'encoding.unsupported' || bodyParserError?.type === 'charset.unsupported') {
    return new AppError(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      ErrorCode.UNSUPPORTED_MEDIA_TYPE,
      'Unsupported content encoding',
    );
  }
  return null;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = normalize(err);

  if (appError) {
    if (appError.statusCode >= 500) req.log?.error({ err }, appError.message);
    return ApiResponse.error(res, appError.statusCode, appError.code, appError.message, appError.details);
  }

  // Unexpected error: log everything, reveal nothing in production.
  req.log?.error({ err }, 'unhandled error');
  const error = err as Error;
  return ApiResponse.error(
    res,
    HttpStatus.INTERNAL_SERVER_ERROR,
    ErrorCode.INTERNAL_ERROR,
    isProduction ? 'An unexpected error occurred' : error.message,
    isProduction ? undefined : { stack: error.stack?.split('\n').map((l) => l.trim()) },
  );
};
