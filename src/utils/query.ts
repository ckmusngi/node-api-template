import { Op, type Order, type WhereOptions } from 'sequelize';
import { AppError } from './app-error';

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Parses "-createdAt,title" into a Sequelize order. Only whitelisted fields are accepted,
 * so column names never come straight from user input.
 */
export function parseSort(
  sort: string | undefined,
  allowed: readonly string[],
  fallback: Order = [['createdAt', 'DESC']],
): Order {
  if (!sort) return fallback;
  const order: [string, 'ASC' | 'DESC'][] = [];
  for (const raw of sort
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const desc = raw.startsWith('-');
    const field = desc ? raw.slice(1) : raw;
    if (!allowed.includes(field)) {
      throw AppError.validation([
        {
          path: 'sort',
          message: `Cannot sort by "${field}". Allowed: ${allowed.join(', ')}`,
        },
      ]);
    }
    order.push([field, desc ? 'DESC' : 'ASC']);
  }
  return order.length ? order : fallback;
}

/** Case-insensitive (per column collation) contains-search across the given columns. */
export function buildSearch(term: string | undefined, fields: readonly string[]): WhereOptions | undefined {
  const trimmed = term?.trim();
  if (!trimmed || fields.length === 0) return undefined;
  const pattern = `%${escapeLike(trimmed)}%`;
  return {
    [Op.or]: fields.map((field) => ({ [field]: { [Op.like]: pattern } })),
  };
}

export type FilterOperator = 'eq' | 'in' | 'gte' | 'lte' | 'like';

export interface FilterDefinition {
  /** Column the filter applies to (defaults to the query key). */
  column?: string;
  op: FilterOperator;
}

/**
 * Converts already-validated query values into Sequelize conditions using a declared
 * mapping. Keys without a definition are ignored, which keeps arbitrary columns out of queries.
 */
export function buildFilters(
  values: Record<string, unknown>,
  definitions: Record<string, FilterDefinition>,
): WhereOptions {
  const where: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(definitions)) {
    const value = values[key];
    if (value === undefined || value === null || value === '') continue;
    const column = def.column ?? key;
    const existing = (where[column] ?? {}) as Record<symbol, unknown>;
    switch (def.op) {
      case 'eq':
        where[column] = value;
        break;
      case 'in':
        where[column] = {
          [Op.in]: Array.isArray(value) ? value : (value as string).split(','),
        };
        break;
      case 'gte':
        where[column] = { ...existing, [Op.gte]: value };
        break;
      case 'lte':
        where[column] = { ...existing, [Op.lte]: value };
        break;
      case 'like':
        where[column] = { [Op.like]: `%${escapeLike(value as string)}%` };
        break;
    }
  }
  return where;
}

export function combineWhere(...parts: (WhereOptions | undefined)[]): WhereOptions {
  const defined = parts.filter((p): p is WhereOptions => !!p && Reflect.ownKeys(p).length > 0);
  if (defined.length === 0) return {};
  if (defined.length === 1) return defined[0]!;
  return { [Op.and]: defined };
}
