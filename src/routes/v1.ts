import { Router } from 'express';
import { auditRouter } from '../modules/audit/audit.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { noteRouter } from '../modules/notes/note.routes';
import { uploadRouter } from '../modules/uploads/upload.routes';
import { userRouter } from '../modules/users/user.routes';
import { webhookRouter } from '../modules/webhooks/webhook.routes';

export const v1Router = Router();

v1Router.use('/auth', authRouter);
v1Router.use('/users', userRouter);
v1Router.use('/notes', noteRouter);
v1Router.use('/uploads', uploadRouter);
v1Router.use('/webhooks', webhookRouter);
v1Router.use('/audit-logs', auditRouter);
