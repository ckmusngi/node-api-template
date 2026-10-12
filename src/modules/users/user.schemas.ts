import { ROLES } from '../../config/rbac';
import { USER_STATUSES } from '../../models/user.model';
import { listQuery, schemas } from '../../utils/validation';
import { z } from '../../utils/zod';

export const UserSchema = z
  .object({
    id: schemas.uuid,
    tenantId: z.uuid().nullable(),
    email: z.string().openapi({ example: 'jane@example.com' }),
    firstName: z.string().openapi({ example: 'Jane' }),
    lastName: z.string().openapi({ example: 'Doe' }),
    role: z.enum(ROLES),
    status: z.enum(USER_STATUSES),
    emailVerifiedAt: z.iso.datetime().nullable(),
    lastLoginAt: z.iso.datetime().nullable(),
    passwordChangedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('User');

export const updateProfileBody = z
  .object({
    firstName: schemas.name.optional(),
    lastName: schemas.name.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')
  .openapi('UpdateProfileRequest');

export const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: schemas.password,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must differ from the current one',
    path: ['newPassword'],
  })
  .openapi('ChangePasswordRequest');

export const USER_SORTABLE = ['createdAt', 'email', 'lastName', 'lastLoginAt'] as const;

export const listUsersQuery = listQuery(USER_SORTABLE).extend({
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  includeDeleted: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const updateStatusBody = z
  .object({
    status: z.enum(USER_STATUSES),
    reason: z.string().trim().max(255).optional(),
  })
  .openapi('UpdateUserStatusRequest');

export const updateRoleBody = z.object({ role: z.enum(ROLES) }).openapi('UpdateUserRoleRequest');

export type UpdateProfileBody = z.infer<typeof updateProfileBody>;
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;
export type ListUsersQuery = z.infer<typeof listUsersQuery>;
export type UpdateStatusBody = z.infer<typeof updateStatusBody>;
export type UpdateRoleBody = z.infer<typeof updateRoleBody>;
