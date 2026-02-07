export function getTraceId(
  request?: { traceId?: string; headers?: Record<string, unknown> },
  response?: { locals?: { traceId?: string } },
): string {
  return (
    request?.traceId ??
    response?.locals?.traceId ??
    (typeof request?.headers?.['x-trace-id'] === 'string' ? request.headers['x-trace-id'] : undefined) ??
    ''
  );
}
