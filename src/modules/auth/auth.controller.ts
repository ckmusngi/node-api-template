import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { env } from '../../config/env';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { HttpStatus } from '../../utils/http-status';
import { versionPath, CURRENT_API_VERSION } from '../../utils/api-version';
import { auditContext } from '../audit/audit.service';
import type { EmailBody, LoginBody, RefreshBody, RegisterBody, ResetPasswordBody, TokenBody } from './auth.schemas';
import * as authService from './auth.service';

const refreshCookieOptions = (expires?: Date): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'strict',
  // Only sent to auth endpoints, never to the rest of the API.
  path: `${versionPath(CURRENT_API_VERSION)}/auth`,
  ...(expires ? { expires } : {}),
});

function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie(env.REFRESH_COOKIE_NAME, token, refreshCookieOptions(expires));
}

function readRefreshToken(req: Request): string | undefined {
  const fromBody = (req.body as RefreshBody | undefined)?.refreshToken;
  const fromCookie = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;
  return fromBody ?? fromCookie;
}

const meta = (req: Request): authService.RequestMeta => auditContext(req);

const GENERIC_EMAIL_MESSAGE = 'If an account exists for that email, a message has been sent.';

export const register: RequestHandler = async (req, res) => {
  const user = await authService.register(req.body as RegisterBody, req.tenantId ?? null, meta(req));
  ApiResponse.created(res, {
    user,
    message: 'Registration successful. Check your email to verify your account.',
  });
};

export const login: RequestHandler = async (req, res) => {
  const result = await authService.login(req.body as LoginBody, meta(req));
  setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);
  ApiResponse.ok(res, result);
};

export const refresh: RequestHandler = async (req, res) => {
  const token = readRefreshToken(req);
  if (!token) throw AppError.unauthorized('Refresh token is required');
  const result = await authService.refresh(token, meta(req));
  setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);
  ApiResponse.ok(res, result);
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(readRefreshToken(req), req.user?.id, meta(req));
  res.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions());
  ApiResponse.noContent(res);
};

export const logoutAll: RequestHandler = async (req, res) => {
  await authService.logoutAll(req.user!.id, meta(req));
  res.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions());
  ApiResponse.noContent(res);
};

export const forgotPassword: RequestHandler = async (req, res) => {
  await authService.forgotPassword((req.body as EmailBody).email, meta(req));
  ApiResponse.ok(res, { message: GENERIC_EMAIL_MESSAGE }, undefined, HttpStatus.ACCEPTED);
};

export const resetPassword: RequestHandler = async (req, res) => {
  const body = req.body as ResetPasswordBody;
  await authService.resetPassword(body.token, body.password, meta(req));
  res.clearCookie(env.REFRESH_COOKIE_NAME, refreshCookieOptions());
  ApiResponse.ok(res, {
    message: 'Password has been reset. Please sign in again.',
  });
};

export const verifyEmail: RequestHandler = async (req, res) => {
  await authService.verifyEmail((req.body as TokenBody).token, meta(req));
  ApiResponse.ok(res, { message: 'Email verified.' });
};

export const resendVerification: RequestHandler = async (req, res) => {
  await authService.resendVerification((req.body as EmailBody).email);
  ApiResponse.ok(res, { message: GENERIC_EMAIL_MESSAGE }, undefined, HttpStatus.ACCEPTED);
};
