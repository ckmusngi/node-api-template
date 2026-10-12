import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { ZodType } from 'zod';
import { z } from '../utils/zod';

export const registry = new OpenAPIRegistry();

export const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Access token from POST /auth/login or /auth/refresh. Send as `Authorization: Bearer <token>`.',
});

registry.registerComponent('securitySchemes', 'refreshCookie', {
  type: 'apiKey',
  in: 'cookie',
  name: 'refresh_token',
  description: 'httpOnly refresh token cookie set by login/refresh (path /api/v1/auth).',
});

export const secured = [{ [bearerAuth.name]: [] }];

export const ErrorResponse = registry.register(
  'ErrorResponse',
  z.object({
    success: z.literal(false),
    error: z.object({
      code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
      message: z.string().openapi({ example: 'Validation failed' }),
      details: z.unknown().optional(),
    }),
    requestId: z.string().openapi({ example: '8d4f0b8e-1f0c-4b8e-9f62-2a6b52b3f7a1' }),
  }),
);

export const PaginationMeta = registry.register(
  'PaginationMeta',
  z.object({
    page: z.number().int().openapi({ example: 1 }),
    limit: z.number().int().openapi({ example: 20 }),
    total: z.number().int().openapi({ example: 42 }),
    totalPages: z.number().int().openapi({ example: 3 }),
    hasNextPage: z.boolean(),
    hasPrevPage: z.boolean(),
  }),
);

export const success = <T extends ZodType>(data: T) =>
  z.object({ success: z.literal(true), data, requestId: z.string() });

export const paginated = <T extends ZodType>(item: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(item),
    meta: z.object({ pagination: PaginationMeta }),
    requestId: z.string(),
  });

export const json = <T extends ZodType>(description: string, schema: T) => ({
  description,
  content: { 'application/json': { schema } },
});

const err = (description: string) => json(description, ErrorResponse);

/** Standard error responses to spread into a path's `responses`. */
export const errors = {
  400: err('Bad request'),
  401: err('Missing, invalid or expired access token'),
  403: err('Authenticated but not allowed'),
  404: err('Not found'),
  409: err('Conflict'),
  422: err('Validation failed'),
  429: err('Rate limit exceeded'),
};
