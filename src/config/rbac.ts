export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'profile:read',
  'profile:update',
  'notes:read:own',
  'notes:write:own',
  'notes:read:any',
  'notes:write:any',
  'users:read',
  'users:manage',
  'audit:read',
  'uploads:create',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const userPermissions: Permission[] = [
  'profile:read',
  'profile:update',
  'notes:read:own',
  'notes:write:own',
  'uploads:create',
];

/** Single source of truth for what each role may do. */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  user: new Set(userPermissions),
  admin: new Set<Permission>(PERMISSIONS),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
