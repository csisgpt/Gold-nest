import { Injectable } from '@nestjs/common';

export interface PaginationResult<T> {
  items: T[];
  meta: {
    totalItems: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

@Injectable()
export class PaginationService {
  getSkipTake(page = 1, limit = 20): { skip: number; take: number; page: number; limit: number } {
    const sanitizedPage = Math.max(1, Math.trunc(page));
    const sanitizedLimit = Math.min(Math.max(1, Math.trunc(limit)), 100);

    return {
      skip: (sanitizedPage - 1) * sanitizedLimit,
      take: sanitizedLimit,
      page: sanitizedPage,
      limit: sanitizedLimit,
    };
  }

  meta(total: number, page = 1, limit = 20): PaginationResult<unknown>['meta'] {
    const sanitized = this.getSkipTake(page, limit);
    const totalPages = sanitized.limit === 0 ? 0 : Math.ceil(total / sanitized.limit);

    return {
      totalItems: total,
      page: sanitized.page,
      limit: sanitized.limit,
      totalPages,
      hasNextPage: sanitized.page < totalPages,
      hasPrevPage: sanitized.page > 1,
    };
  }

  wrap<T>(items: T[], total: number, page = 1, limit = 20): PaginationResult<T> {
    const sanitized = this.getSkipTake(page, limit);
    return {
      items,
      meta: this.meta(total, sanitized.page, sanitized.limit),
    };
  }

  resolvePaging(params: { page?: number; limit?: number; offset?: number }): {
    page: number;
    limit: number;
    offsetUsed: boolean;
  } {
    const limit = Math.min(Math.max(Math.trunc(params.limit ?? 20), 1), 100);
    if (params.page === undefined && params.offset !== undefined) {
      const offset = Math.max(Math.trunc(params.offset), 0);
      return {
        page: Math.floor(offset / limit) + 1,
        limit,
        offsetUsed: true,
      };
    }

    return {
      page: Math.max(Math.trunc(params.page ?? 1), 1),
      limit,
      offsetUsed: false,
    };
  }
}
