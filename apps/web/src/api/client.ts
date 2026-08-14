import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorResponse, AuthTokens, CurrentUserDto } from '@gsm/shared';

const ACCESS_KEY = 'gsm.accessToken';
const REFRESH_KEY = 'gsm.refreshToken';

export const tokenStorage = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  save(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): void {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  timeout: 30_000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Обновление истёкшего access-токена.
 *
 * Параллельные запросы, получившие 401 одновременно, ждут один общий
 * запрос обновления — иначе каждый начнёт свой, и ротация refresh-токенов
 * на сервере отзовёт токены друг друга.
 */
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStorage.refresh;
  if (!refreshToken) throw new Error('no refresh token');

  const { data } = await axios.post<AuthTokens & { user: CurrentUserDto }>(
    `${api.defaults.baseURL}/auth/refresh`,
    { refreshToken },
  );

  tokenStorage.save(data);
  return data.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    const isAuthEndpoint = original?.url?.includes('/auth/');
    if (error.response?.status !== 401 || original?._retried || isAuthEndpoint) {
      return Promise.reject(error);
    }

    original._retried = true;

    try {
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      const token = await refreshPromise;
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch {
      tokenStorage.clear();
      window.location.href = '/login';
      return Promise.reject(error);
    }
  },
);

/** Текст ошибки для показа пользователю. */
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    return error.response?.data?.message ?? error.message;
  }
  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}
