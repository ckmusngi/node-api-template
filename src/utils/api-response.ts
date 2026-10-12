import type { Response } from 'express';
import { HttpStatus } from './http-status';
import type { PaginationMeta } from './pagination';

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
  requestId?: string;
}

export interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

function requestIdOf(res: Response): string | undefined {
  return res.locals.requestId as string | undefined;
}

export const ApiResponse = {
  ok<T>(res: Response, data: T, meta?: Record<string, unknown>, status: number = HttpStatus.OK) {
    const body: SuccessBody<T> = {
      success: true,
      data,
      ...(meta ? { meta } : {}),
      requestId: requestIdOf(res),
    };
    return res.status(status).json(body);
  },
  created<T>(res: Response, data: T) {
    return ApiResponse.ok(res, data, undefined, HttpStatus.CREATED);
  },
  paginated<T>(res: Response, data: T[], pagination: PaginationMeta) {
    return ApiResponse.ok(res, data, { pagination });
  },
  noContent(res: Response) {
    return res.status(HttpStatus.NO_CONTENT).end();
  },
  error(res: Response, status: number, code: string, message: string, details?: unknown) {
    const body: ErrorBody = {
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
      requestId: requestIdOf(res),
    };
    return res.status(status).json(body);
  },
};
