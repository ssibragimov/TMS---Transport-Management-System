import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthTokens, CurrentUserDto, Permission } from '@gsm/shared';

import { api, tokenStorage } from '@/api/client';

interface AuthState {
  user: CurrentUserDto | null;
  loading: boolean;
  login: (email: string, password: string, officeId?: number) => Promise<void>;
  logout: () => Promise<void>;
  /** Переключение активного офиса. Выдаёт новые токены и перезагружает данные. */
  switchOffice: (officeId: number) => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

type LoginResponse = AuthTokens & { user: CurrentUserDto };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUserDto | null>(null);
  const [loading, setLoading] = useState(true);

  // Восстановление сессии при перезагрузке страницы: токен лежит
  // в localStorage, но профиль и права надо получить заново — роль
  // могли поменять, пока вкладка была закрыта.
  useEffect(() => {
    if (!tokenStorage.access) {
      setLoading(false);
      return;
    }

    api
      .get<CurrentUserDto>('/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => tokenStorage.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string, officeId?: number) => {
    const { data } = await api.post<LoginResponse>('/auth/login', {
      email,
      password,
      officeId,
    });
    tokenStorage.save(data);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokenStorage.refresh;
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
    }
    tokenStorage.clear();
    setUser(null);
  }, []);

  const switchOffice = useCallback(async (officeId: number) => {
    const { data } = await api.post<LoginResponse>('/auth/switch-office', { officeId });
    tokenStorage.save(data);
    setUser(data.user);
    // Полная перезагрузка вместо инвалидации кэша: в новом офисе меняется
    // весь набор данных, и проще гарантировать чистое состояние.
    window.location.reload();
  }, []);

  const can = useCallback(
    (permission: Permission) => user?.permissions.includes(permission) ?? false,
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, logout, switchOffice, can }),
    [user, loading, login, logout, switchOffice, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth вызван вне AuthProvider');
  return context;
}
