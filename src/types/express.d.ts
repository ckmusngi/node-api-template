import type { Role } from '../config/rbac';

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      email: string;
      role: Role;
      tenantId: string | null;
    }

    interface Request {
      user?: AuthUser;
      /** Parsed output of the `validate` middleware. */
      validated: { body?: unknown; query?: unknown; params?: unknown };
      /** Raw request body, populated for routes that need signature verification. */
      rawBody?: Buffer;
      tenantId?: string | null;
    }
  }
}

export {};
