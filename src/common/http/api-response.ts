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
      traceId: string;
      ts: string;
    }
  | {
      ok: false;
      result: null;
      error: ApiError;
      traceId: string;
      ts: string;
    };

export function nowIso(): string {
  return new Date().toISOString();
}
