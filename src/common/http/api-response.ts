export interface ApiFieldError {
  path: string;
  message: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: ApiFieldError[];
}

export type ApiResponse<T> =
  | {
      ok: true;
      result: T;
      meta?: unknown;
      error: null;
      traceId: string;
      ts: string;
    }
  | {
      ok: false;
      result: null;
      meta?: unknown;
      error: ApiError;
      traceId: string;
      ts: string;
    };

export function nowIso(): string {
  return new Date().toISOString();
}
