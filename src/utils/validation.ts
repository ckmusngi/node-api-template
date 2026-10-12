import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './pagination';
import { z } from './zod';

/** Reusable schemas shared across modules. */
export const schemas = {
  uuid: z.uuid().openapi({ example: '3f1c2b8e-8a7d-4a51-9f5b-2f6a1d0c9e44' }),
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase())
    .openapi({ example: 'jane@example.com' }),
  /** bcrypt only uses the first 72 bytes, so longer passwords are rejected. */
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/\d/, 'Password must contain a number')
    .openapi({ example: 'Sup3rSecret!' }),
  name: z.string().trim().min(1).max(80),
  token: z.string().min(16).max(256),
  isoDate: z.coerce.date().openapi({ type: 'string', format: 'date-time' }),
};

export const idParams = z.object({ id: schemas.uuid });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).openapi({ example: 20 }),
});

/** Builds a list query schema (pagination + sort + search) for the given sortable fields. */
export function listQuery<const T extends readonly [string, ...string[]]>(sortable: T) {
  const sortPattern = new RegExp(`^-?(${sortable.join('|')})(,-?(${sortable.join('|')}))*$`);
  return paginationQuery.extend({
    sort: z
      .string()
      .regex(sortPattern, `Sort by: ${sortable.join(', ')} (prefix with - for descending)`)
      .optional()
      .openapi({ example: `-${sortable[0]}` }),
    search: z.string().trim().max(100).optional(),
  });
}
