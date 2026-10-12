import { errors, json, paginated, registry, secured, success } from '../../docs/registry';
import { idParams } from '../../utils/validation';
import { type z } from '../../utils/zod';
import { MessageSchema, TokensSchema } from '../auth/auth.schemas';
import {
  UserSchema,
  changePasswordBody,
  listUsersQuery,
  updateProfileBody,
  updateRoleBody,
  updateStatusBody,
} from './user.schemas';

const tags = ['Users'];
const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { 'application/json': { schema } } },
});
const auth = { 401: errors[401], 403: errors[403] };

registry.registerPath({
  method: 'get',
  path: '/users/me',
  tags,
  security: secured,
  summary: 'Get the current user',
  responses: { 200: json('Profile', success(UserSchema)), ...auth },
});
registry.registerPath({
  method: 'patch',
  path: '/users/me',
  tags,
  security: secured,
  summary: 'Update the current user profile',
  request: body(updateProfileBody),
  responses: {
    200: json('Updated profile', success(UserSchema)),
    ...auth,
    422: errors[422],
  },
});
registry.registerPath({
  method: 'post',
  path: '/users/me/change-password',
  tags,
  security: secured,
  summary: 'Change password (signs out other sessions)',
  description: 'Revokes every existing session, including the current access token, and returns a fresh token pair.',
  request: body(changePasswordBody),
  responses: {
    200: json('Password changed', success(MessageSchema.extend({ tokens: TokensSchema }))),
    ...auth,
    422: errors[422],
  },
});
registry.registerPath({
  method: 'delete',
  path: '/users/me',
  tags,
  security: secured,
  summary: 'Delete (soft) the current account',
  responses: { 204: { description: 'Deleted' }, ...auth },
});

registry.registerPath({
  method: 'get',
  path: '/users',
  tags: ['Users (admin)'],
  security: secured,
  summary: 'List users',
  description:
    'Requires `users:read`. Supports `page`, `limit`, `sort` (e.g. `-createdAt,email`), `search` (email/name), `role`, `status`, `includeDeleted`.',
  request: { query: listUsersQuery },
  responses: {
    200: json('Users', paginated(UserSchema)),
    ...auth,
    422: errors[422],
  },
});
registry.registerPath({
  method: 'get',
  path: '/users/{id}',
  tags: ['Users (admin)'],
  security: secured,
  summary: 'Get a user',
  request: { params: idParams },
  responses: {
    200: json('User', success(UserSchema)),
    ...auth,
    404: errors[404],
  },
});
registry.registerPath({
  method: 'patch',
  path: '/users/{id}/status',
  tags: ['Users (admin)'],
  security: secured,
  summary: 'Activate, deactivate or suspend a user',
  description: 'Setting `inactive` or `suspended` revokes all of the user’s sessions.',
  request: { params: idParams, ...body(updateStatusBody) },
  responses: {
    200: json('User', success(UserSchema)),
    ...auth,
    404: errors[404],
  },
});
registry.registerPath({
  method: 'patch',
  path: '/users/{id}/role',
  tags: ['Users (admin)'],
  security: secured,
  summary: 'Change a user role',
  request: { params: idParams, ...body(updateRoleBody) },
  responses: {
    200: json('User', success(UserSchema)),
    ...auth,
    404: errors[404],
  },
});
registry.registerPath({
  method: 'delete',
  path: '/users/{id}',
  tags: ['Users (admin)'],
  security: secured,
  summary: 'Soft delete a user',
  request: { params: idParams },
  responses: { 204: { description: 'Deleted' }, ...auth, 404: errors[404] },
});
registry.registerPath({
  method: 'post',
  path: '/users/{id}/restore',
  tags: ['Users (admin)'],
  security: secured,
  summary: 'Restore a soft-deleted user',
  request: { params: idParams },
  responses: {
    200: json('User', success(UserSchema)),
    ...auth,
    404: errors[404],
  },
});
