import { registerBody } from '../../src/modules/auth/auth.schemas';
import { listNotesQuery } from '../../src/modules/notes/note.schemas';
import { schemas } from '../../src/utils/validation';

describe('reusable schemas', () => {
  it('normalizes emails', () => {
    expect(schemas.email.parse('Jane@Example.COM')).toBe('jane@example.com');
    expect(schemas.email.safeParse('not-an-email').success).toBe(false);
  });

  it('enforces password policy within bcrypt limits', () => {
    expect(schemas.password.safeParse('Password123').success).toBe(true);
    expect(schemas.password.safeParse('short1A').success).toBe(false);
    expect(schemas.password.safeParse('alllowercase1').success).toBe(false);
    expect(schemas.password.safeParse(`A1${'a'.repeat(80)}`).success).toBe(false);
  });

  it('strips unknown keys such as role from registration (mass assignment)', () => {
    const parsed = registerBody.parse({
      email: 'a@b.co',
      password: 'Password123',
      firstName: 'A',
      lastName: 'B',
      role: 'admin',
    });
    expect(parsed).not.toHaveProperty('role');
  });

  it('validates list queries', () => {
    const q = listNotesQuery.parse({ page: '2', limit: '5', sort: '-createdAt,title' });
    expect(q).toMatchObject({ page: 2, limit: 5, scope: 'own' });
    expect(listNotesQuery.safeParse({ sort: 'password' }).success).toBe(false);
    expect(listNotesQuery.safeParse({ limit: '1000' }).success).toBe(false);
    expect(listNotesQuery.safeParse({ status: 'draft,bogus' }).success).toBe(false);
  });
});
