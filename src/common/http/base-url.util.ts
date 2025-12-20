import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

export function resolveBaseUrl(req: Request, configService: ConfigService): string {
  const publicBase = configService.get<string>('PUBLIC_BASE_URL');
  if (publicBase) {
    return trimTrailingSlash(publicBase);
  }

  const trustProxy =
    (configService.get<string>('TRUST_PROXY') ?? 'false').toString().toLowerCase() === 'true';

  let protocol = req.protocol;
  let host = req.get('host') ?? '';

  if (trustProxy) {
    const forwardedProto = req.header('x-forwarded-proto');
    const forwardedHost = req.header('x-forwarded-host');
    const forwardedPort = req.header('x-forwarded-port');

    if (forwardedProto) {
      protocol = forwardedProto.split(',')[0].trim();
    }
    if (forwardedHost) {
      host = forwardedHost.split(',')[0].trim();
    }
    if (forwardedPort && !host.includes(':')) {
      host = `${host}:${forwardedPort.split(',')[0].trim()}`;
    }
  }

  return trimTrailingSlash(`${protocol}://${host}`);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
