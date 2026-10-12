import { errors, json, registry, secured, success } from '../../docs/registry';
import { UserSchema } from '../users/user.schemas';
import { z } from '../../utils/zod';
import {
  AuthResultSchema,
  MessageSchema,
  emailBody,
  loginBody,
  refreshBody,
  registerBody,
  resetPasswordBody,
  tokenBody,
} from './auth.schemas';

const tags = ['Auth'];
const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { 'application/json': { schema } } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/register',
  tags,
  summary: 'Register a new account',
  description:
    'Creates a user and emails a verification link. With multi-tenancy enabled, send `X-Tenant-Slug` to join a tenant.',
  request: body(registerBody),
  responses: {
    201: json('Account created', success(z.object({ user: UserSchema, message: z.string() }))),
    409: errors[409],
    422: errors[422],
    429: errors[429],
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags,
  summary: 'Sign in with email and password',
  description:
    'Returns a short-lived JWT access token and a rotating refresh token. The refresh token is also set as an httpOnly cookie scoped to `/api/v1/auth`. Repeated failures lock the account temporarily (423).',
  request: body(loginBody),
  responses: {
    200: json('Signed in', success(AuthResultSchema)),
    401: errors[401],
    403: errors[403],
    423: json('Account temporarily locked', errors[401].content['application/json'].schema),
    429: errors[429],
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  tags,
  summary: 'Rotate the refresh token and get a new access token',
  description:
    'Send the refresh token in the body or via the cookie. Each refresh token can be used once; reusing a rotated token revokes the whole session family.',
  request: body(refreshBody),
  responses: {
    200: json('New token pair', success(AuthResultSchema)),
    401: errors[401],
    403: errors[403],
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags,
  summary: 'Revoke the current refresh token',
  request: body(refreshBody),
  responses: { 204: { description: 'Signed out' } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout-all',
  tags,
  security: secured,
  summary: 'Revoke every refresh token for the current user',
  responses: { 204: { description: 'All sessions revoked' }, 401: errors[401] },
});

registry.registerPath({
  method: 'post',
  path: '/auth/forgot-password',
  tags,
  summary: 'Request a password reset email',
  description: 'Always returns 202 so the endpoint cannot be used to discover registered emails.',
  request: body(emailBody),
  responses: {
    202: json('Accepted', success(MessageSchema)),
    422: errors[422],
    429: errors[429],
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/reset-password',
  tags,
  summary: 'Set a new password using a reset token',
  description: 'Revokes all existing sessions for the account.',
  request: body(resetPasswordBody),
  responses: {
    200: json('Password reset', success(MessageSchema)),
    400: errors[400],
    422: errors[422],
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/verify-email',
  tags,
  summary: 'Verify an email address',
  request: body(tokenBody),
  responses: {
    200: json('Verified', success(MessageSchema)),
    400: errors[400],
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/resend-verification',
  tags,
  summary: 'Resend the verification email',
  request: body(emailBody),
  responses: { 202: json('Accepted', success(MessageSchema)) },
});
