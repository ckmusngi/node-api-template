import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate';
import { authLimiter } from '../../middleware/rate-limit';
import { resolveTenant } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import * as controller from './auth.controller';
import { emailBody, loginBody, refreshBody, registerBody, resetPasswordBody, tokenBody } from './auth.schemas';

export const authRouter = Router();

authRouter.post('/register', authLimiter, resolveTenant, validate({ body: registerBody }), controller.register);
authRouter.post('/login', authLimiter, validate({ body: loginBody }), controller.login);
authRouter.post('/refresh', validate({ body: refreshBody }), controller.refresh);
authRouter.post('/logout', optionalAuthenticate, validate({ body: refreshBody }), controller.logout);
authRouter.post('/logout-all', authenticate, controller.logoutAll);
authRouter.post('/forgot-password', authLimiter, validate({ body: emailBody }), controller.forgotPassword);
authRouter.post('/reset-password', authLimiter, validate({ body: resetPasswordBody }), controller.resetPassword);
authRouter.post('/verify-email', authLimiter, validate({ body: tokenBody }), controller.verifyEmail);
authRouter.post('/resend-verification', authLimiter, validate({ body: emailBody }), controller.resendVerification);
