import { BadRequestException } from '@nestjs/common';
import { ApiFieldError } from '../http/api-response';

const truthyValues = new Set(['true', '1', 'yes', 'on']);
const falsyValues = new Set(['false', '0', 'no', 'off']);

function badRequest(path: string, message: string): BadRequestException {
  const details: ApiFieldError[] = [{ path, message }];
  return new BadRequestException({ message: 'Validation failed', details });
}

export function parseBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  const normalized = String(value).trim().toLowerCase();
  if (truthyValues.has(normalized)) return true;
  if (falsyValues.has(normalized)) return false;
  throw badRequest(path, 'must be a boolean value');
}

export function parseNumber(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  throw badRequest(path, 'must be a numeric value');
}

export type SortDirection = 'asc' | 'desc';

export interface NormalizedSort {
  field: string;
  direction: SortDirection;
}

export function normalizeSort(
  params: {
    sort?: string;
    sortBy?: string;
    orderBy?: string;
    direction?: string;
    dir?: string;
    order?: string;
  },
  options?: { path?: string; allowedFields?: string[] },
): NormalizedSort[] {
  const path = options?.path ?? 'sort';
  const rawSort = params.sort ?? params.orderBy ?? params.sortBy;
  if (!rawSort) {
    return [];
  }

  const directionParam = params.direction ?? params.dir ?? params.order;
  const directionHint = directionParam ? String(directionParam).toLowerCase() : undefined;

  const entries = String(rawSort)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.map((entry) => {
    let field = entry;
    let direction: SortDirection | undefined;

    if (entry.startsWith('-')) {
      field = entry.slice(1);
      direction = 'desc';
    } else if (entry.includes(':')) {
      const [name, dir] = entry.split(':', 2);
      field = name;
      direction = dir ? (dir.toLowerCase() as SortDirection) : undefined;
    } else if (entry.includes('_')) {
      const match = entry.match(/^(.*)_(asc|desc)$/i);
      if (match) {
        field = match[1];
        direction = match[2].toLowerCase() as SortDirection;
      }
    }

    if (!direction) {
      direction = directionHint === 'desc' ? 'desc' : 'asc';
    }

    if (!field) {
      throw badRequest(path, 'must include a sort field');
    }

    if (direction !== 'asc' && direction !== 'desc') {
      throw badRequest(path, 'must specify sort direction as asc or desc');
    }

    if (options?.allowedFields?.length && !options.allowedFields.includes(field)) {
      throw badRequest(path, `invalid sort field: ${field}`);
    }

    return { field, direction };
  });
}
