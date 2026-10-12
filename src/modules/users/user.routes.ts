import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { idParams } from '../../utils/validation';
import * as controller from './user.controller';
import {
  changePasswordBody,
  listUsersQuery,
  updateProfileBody,
  updateRoleBody,
  updateStatusBody,
} from './user.schemas';

export const userRouter = Router();

userRouter.use(authenticate);

// Current user
userRouter.get('/me', authorize('profile:read'), controller.getMe);
userRouter.patch('/me', authorize('profile:update'), validate({ body: updateProfileBody }), controller.updateMe);
userRouter.post(
  '/me/change-password',
  authorize('profile:update'),
  validate({ body: changePasswordBody }),
  controller.changePassword,
);
userRouter.delete('/me', authorize('profile:update'), controller.deleteMe);

// Administration
userRouter.get('/', authorize('users:read'), validate({ query: listUsersQuery }), controller.list);
userRouter.get('/:id', authorize('users:read'), validate({ params: idParams }), controller.getById);
userRouter.patch(
  '/:id/status',
  authorize('users:manage'),
  validate({ params: idParams, body: updateStatusBody }),
  controller.updateStatus,
);
userRouter.patch(
  '/:id/role',
  authorize('users:manage'),
  validate({ params: idParams, body: updateRoleBody }),
  controller.updateRole,
);
userRouter.delete('/:id', authorize('users:manage'), validate({ params: idParams }), controller.remove);
userRouter.post('/:id/restore', authorize('users:manage'), validate({ params: idParams }), controller.restore);
