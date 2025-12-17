export interface AxiosRequestConfig {
  url?: string;
  method?: string;
  baseURL?: string;
  headers?: Record<string, any>;
  data?: any;
}

export interface AxiosResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, any>;
  config: AxiosRequestConfig;
}

export class AxiosError<T = any> extends Error {
  constructor(message?: string, code?: string, config?: AxiosRequestConfig, response?: AxiosResponse<T>);
  code?: string;
  config?: AxiosRequestConfig;
  response?: AxiosResponse<T>;
}

declare function axios<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>;

declare namespace axios {
  function create(defaultConfig?: AxiosRequestConfig): typeof axios;
  const AxiosError: typeof import('./index').AxiosError;
}

export default axios;
export { AxiosRequestConfig, AxiosResponse, AxiosError };
