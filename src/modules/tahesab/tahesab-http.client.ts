import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import type { TahesabMethodMap } from './tahesab.methods';

@Injectable()
export class TahesabHttpClient {
  private readonly logger = new Logger(TahesabHttpClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private buildHeaders(
    additionalHeaders?: Record<string, string | undefined>,
  ): Record<string, string | undefined> {
    const token = this.configService.get<string>('TAHESAB_AUTH_TOKEN');
    const dbName = this.configService.get<string>('TAHESAB_DB_NAME');

    return {
      Authorization: token ? `Bearer ${token}` : undefined,
      DBName: dbName,
      'Content-Type': 'application/json',
      ...additionalHeaders,
    };
  }

  async call<K extends keyof TahesabMethodMap>(
    methodName: K,
    args: TahesabMethodMap[K]['args'],
    config?: AxiosRequestConfig,
  ): Promise<TahesabMethodMap[K]['response']> {
    const headers = this.buildHeaders(
      (config?.headers as Record<string, string | undefined>) ?? {},
    );

    const body = { [methodName]: args } as Record<string, unknown>;

    try {
      const response = await firstValueFrom(
        this.http.post<TahesabMethodMap[K]['response']>(
          '/',
          body,
          { ...config, headers },
        ),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? 500;
      const message =
        (typeof axiosError.response?.data === 'string'
          ? axiosError.response?.data
          : undefined) || axiosError.message || 'Error communicating with Tahesab API';

      this.logger.error(
        `Tahesab POST failed with status ${status}: ${axiosError.message}`,
        axiosError.stack,
      );

      throw new HttpException(message, status);
    }
  }
}
