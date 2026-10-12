import { UserSchema } from '../users/user.schemas';
import { schemas } from '../../utils/validation';
import { z } from '../../utils/zod';

export const registerBody = z
  .object({
    email: schemas.email,
    password: schemas.password,
    firstName: schemas.name.openapi({ example: 'Jane' }),
    lastName: schemas.name.openapi({ example: 'Doe' }),
  })
  .openapi('RegisterRequest');

export const loginBody = z
  .object({
    email: schemas.email,
    // Not validated for strength here: login must not reveal password policy details.
    password: z.string().min(1).max(72).openapi({ example: 'Sup3rSecret!' }),
  })
  .openapi('LoginRequest');

export const refreshBody = z
  .object({
    refreshToken: z.string().min(16).max(256).optional().openapi({
      description: 'Optional when the refresh_token cookie is sent (browsers). Required for non-browser clients.',
    }),
  })
  .openapi('RefreshRequest');

export const emailBody = z.object({ email: schemas.email }).openapi('EmailRequest');
export const tokenBody = z.object({ token: schemas.token }).openapi('TokenRequest');
export const resetPasswordBody = z
  .object({ token: schemas.token, password: schemas.password })
  .openapi('ResetPasswordRequest');

export const TokensSchema = z
  .object({
    tokenType: z.literal('Bearer'),
    accessToken: z.string().openapi({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
    expiresIn: z.number().int().openapi({
      example: 900,
      description: 'Access token lifetime in seconds',
    }),
    refreshToken: z.string().openapi({ example: 'b3JkZXItYS1yYW5kb20tb3BhcXVlLXRva2Vu...' }),
    refreshTokenExpiresAt: z.iso.datetime(),
  })
  .openapi('Tokens');

export const AuthResultSchema = z.object({ user: UserSchema, tokens: TokensSchema }).openapi('AuthResult');
export const MessageSchema = z.object({ message: z.string() }).openapi('Message');

export type RegisterBody = z.infer<typeof registerBody>;
export type LoginBody = z.infer<typeof loginBody>;
export type RefreshBody = z.infer<typeof refreshBody>;
export type EmailBody = z.infer<typeof emailBody>;
export type TokenBody = z.infer<typeof tokenBody>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBody>;
