import { Injectable } from '@nestjs/common';

export interface PaginationResult<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
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
    const pages = sanitized.limit === 0 ? 0 : Math.ceil(total / sanitized.limit);

    return {
      total,
      page: sanitized.page,
      limit: sanitized.limit,
      pages,
      hasNext: sanitized.page < pages,
      hasPrev: sanitized.page > 1,
    };
  }

  wrap<T>(items: T[], total: number, page = 1, limit = 20): PaginationResult<T> {
    const sanitized = this.getSkipTake(page, limit);
    return {
      items,
      meta: this.meta(total, sanitized.page, sanitized.limit),
    };
  }
}
