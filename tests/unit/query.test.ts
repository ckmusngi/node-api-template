import { Op } from 'sequelize';
import { AppError } from '../../src/utils/app-error';
import { buildPaginationMeta, toOffset } from '../../src/utils/pagination';
import { buildFilters, buildSearch, combineWhere, escapeLike, parseSort } from '../../src/utils/query';

describe('parseSort', () => {
  const allowed = ['createdAt', 'title'];

  it('builds an order from a whitelist', () => {
    expect(parseSort('-createdAt,title', allowed)).toEqual([
      ['createdAt', 'DESC'],
      ['title', 'ASC'],
    ]);
  });

  it('falls back to the default', () => {
    expect(parseSort(undefined, allowed)).toEqual([['createdAt', 'DESC']]);
  });

  it('rejects fields outside the whitelist (prevents SQL injection via ORDER BY)', () => {
    expect(() => parseSort('password', allowed)).toThrow(AppError);
    expect(() => parseSort('title; DROP TABLE users', allowed)).toThrow(AppError);
  });
});

describe('search and filters', () => {
  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('builds an OR search across fields', () => {
    const where = buildSearch(' hello ', ['title', 'content']) as Record<symbol, unknown>;
    expect(where[Op.or]).toEqual([{ title: { [Op.like]: '%hello%' } }, { content: { [Op.like]: '%hello%' } }]);
    expect(buildSearch('   ', ['title'])).toBeUndefined();
  });

  it('only applies declared filters', () => {
    const from = new Date('2026-01-01');
    const where = buildFilters(
      { status: 'draft,published', from, role: 'admin', evil: 'x' },
      { status: { op: 'in' }, from: { op: 'gte', column: 'createdAt' }, role: { op: 'eq' } },
    );
    expect(where).toEqual({
      status: { [Op.in]: ['draft', 'published'] },
      createdAt: { [Op.gte]: from },
      role: 'admin',
    });
  });

  it('merges range filters on the same column', () => {
    const where = buildFilters(
      { from: 1, to: 5 },
      { from: { op: 'gte', column: 'n' }, to: { op: 'lte', column: 'n' } },
    );
    expect(where).toEqual({ n: { [Op.gte]: 1, [Op.lte]: 5 } });
  });

  it('combines where clauses', () => {
    expect(combineWhere({}, undefined)).toEqual({});
    expect(combineWhere({ a: 1 })).toEqual({ a: 1 });
    expect(combineWhere({ a: 1 }, { b: 2 })).toEqual({ [Op.and]: [{ a: 1 }, { b: 2 }] });
  });
});

describe('pagination', () => {
  it('computes offsets and clamps page size', () => {
    expect(toOffset({ page: 3, limit: 10 })).toEqual({ limit: 10, offset: 20 });
    expect(toOffset({ page: 0, limit: 1000 })).toEqual({ limit: 100, offset: 0 });
  });

  it('builds metadata', () => {
    expect(buildPaginationMeta(45, { page: 2, limit: 20 })).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true,
    });
    expect(buildPaginationMeta(0, { page: 1, limit: 20 }).totalPages).toBe(1);
  });
});
