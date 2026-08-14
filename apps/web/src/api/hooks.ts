import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import type { PaginatedResult } from '@gsm/shared';

import { api, errorMessage } from './client';

export interface Dictionaries {
  fuelTypes: Array<{ id: number; code: string; name: string; density: string }>;
  vehicleModels: Array<{
    id: number;
    category: string;
    manufacturer: string;
    model: string;
    meterType: string;
    tankCapacity: string | null;
    fuelTypeId: number | null;
    seats: number | null;
  }>;
  departments: Array<{ id: number; code: string; name: string }>;
  counterparties: Array<{ id: number; name: string; inn: string | null }>;
}

/**
 * Справочники для форм. Кэшируются надолго: номенклатура техники и видов
 * топлива меняется в лучшем случае раз в квартал, а нужна почти в каждой форме.
 */
export function useDictionaries() {
  return useQuery({
    queryKey: ['dictionaries'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await api.get<Dictionaries>('/dictionaries');
      return data;
    },
  });
}

/** Списочный запрос с пагинацией. */
export function usePaged<T>(
  key: unknown[],
  url: string,
  params: Record<string, unknown>,
  enabled = true,
) {
  return useQuery({
    queryKey: [...key, params],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<PaginatedResult<T>>(url, { params });
      return data;
    },
  });
}

/**
 * Мутация с уведомлением и обновлением связанных списков.
 *
 * Сообщения об ошибках берутся из поля message ответа API: сервер отдаёт
 * осмысленный текст («В ёмкости недостаточно топлива: остаток 120 л»),
 * и подменять его общей фразой «Ошибка сохранения» — терять смысл.
 */
export function useApiMutation<TVariables, TResult = unknown>(
  request: (variables: TVariables) => Promise<TResult>,
  options: { successMessage?: string; invalidate?: unknown[][] } = {},
) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      if (options.successMessage) void message.success(options.successMessage);
      for (const key of options.invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (error) => {
      void message.error(errorMessage(error));
    },
  });
}

/**
 * Загружает картинку из защищённого эндпоинта и отдаёт blob-ссылку.
 *
 * Обычный `<img src="/api/...">` не подходит: браузер не приложит к такому
 * запросу заголовок Authorization, и сервер ответит 401. Ссылка живёт до
 * размонтирования компонента, потом освобождается.
 */
export function useAuthedImage(url: string | null): string | null {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setHref(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    void api
      .get(url, { responseType: 'blob' })
      .then((response) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(response.data as Blob);
        setHref(objectUrl);
      })
      .catch(() => setHref(null));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return href;
}

/**
 * Скачивание файла из защищённого эндпоинта.
 *
 * Обычная ссылка не подходит: в заголовке нужен токен, а положить его
 * в адресную строку — значит оставить в истории браузера и логах прокси.
 */
export function useDownload() {
  const { message } = App.useApp();

  return useCallback(
    async (url: string, params: Record<string, unknown>, fallbackName: string) => {
      try {
        const response = await api.get(url, { params, responseType: 'blob' });

        const disposition = String(response.headers['content-disposition'] ?? '');
        const match = /filename="?([^"]+)"?/.exec(disposition);
        const fileName = match ? match[1] : fallbackName;

        const href = URL.createObjectURL(response.data as Blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(href);
      } catch (error) {
        void message.error(errorMessage(error));
      }
    },
    [message],
  );
}
