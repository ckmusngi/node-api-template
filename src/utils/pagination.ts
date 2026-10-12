export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationInput {
  page: number;
  limit: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function toOffset({ page, limit }: PaginationInput): {
  limit: number;
  offset: number;
} {
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const safePage = Math.max(1, page);
  return { limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

export function buildPaginationMeta(total: number, { page, limit }: PaginationInput): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
