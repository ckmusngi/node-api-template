import { HttpStatus } from './http-status';

export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * An expected, client-facing error. Anything thrown that is not an AppError is
 * treated as an unexpected 500 and its message is hidden in production.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message, details);
  }
  static validation(details: unknown, message = 'Validation failed') {
    return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_ERROR, message, details);
  }
  static unauthorized(message = 'Authentication required', code: ErrorCode = ErrorCode.UNAUTHORIZED) {
    return new AppError(HttpStatus.UNAUTHORIZED, code, message);
  }
  static forbidden(
    message = 'You do not have permission to perform this action',
    code: ErrorCode = ErrorCode.FORBIDDEN,
  ) {
    return new AppError(HttpStatus.FORBIDDEN, code, message);
  }
  static notFound(resource = 'Resource') {
    return new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${resource} not found`);
  }
  static conflict(message: string, code: ErrorCode = ErrorCode.CONFLICT) {
    return new AppError(HttpStatus.CONFLICT, code, message);
  }
}
