import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorResponse, AuthTokens, CurrentUserDto } from '@gsm/shared';

import i18n from '@/i18n';

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

/**
 * Текст ошибки для показа пользователю.
 *
 * Сервер отдаёт и машинный код (`stock.insufficient`), и русский текст.
 * Ищем перевод по коду, а при его отсутствии показываем серверный текст —
 * ровно то, что было до появления переводов. Поэтому неизвестный код
 * не ломает ничего: пользователь видит сообщение сервера как раньше.
 *
 * Ограничение, которое надо помнить: серверный текст часто содержит числа
 * («на складе 63 л, требуется 99999»), а перевод по коду их не знает —
 * сервер параметров не передаёт. Поэтому переведённые сообщения формулируются
 * так, чтобы оставаться осмысленными без цифр, а коды, где цифры критичны,
 * намеренно оставлены без перевода до тех пор, пока сервер не начнёт слать
 * подстановки отдельным полем.
 */
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const response = error.response?.data;
    const fallback = response?.message ?? error.message;
    if (!response?.code) return fallback;
    return i18n.t(`error.${response.code}`, { defaultValue: fallback });
  }
  return error instanceof Error ? error.message : i18n.t('Неизвестная ошибка');
}
