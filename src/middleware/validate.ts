import type { RequestHandler } from 'express';
import type { ZodType, z } from 'zod';
import { AppError } from '../utils/app-error';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export function formatZodIssues(issues: z.core.$ZodIssue[]) {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validates and coerces request input. Parsed values are written to `req.validated`
 * (Express 5 exposes `req.query` as read-only) and `req.body` is replaced with the
 * parsed body so unknown keys are stripped.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const errors: ReturnType<typeof formatZodIssues> = [];
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        req.validated[part] = result.data;
        if (part === 'body') req.body = result.data;
      } else {
        errors.push(
          ...formatZodIssues(result.error.issues).map((e) => ({
            ...e,
            path: e.path ? `${part}.${e.path}` : part,
          })),
        );
      }
    }
    if (errors.length) return next(AppError.validation(errors));
    next();
  };
}

/** Typed accessor for validated input inside handlers. */
export function input<T>(value: unknown): T {
  return value as T;
}
