import type { Permission } from './permissions';

/** Курсорная пагинация отсутствует намеренно: в справочниках нужны номера страниц. */
export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** Полнотекстовый поиск по основным полям сущности */
  search?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** Единый формат ошибки API. Возвращается фильтром AllExceptionsFilter. */
export interface ApiErrorResponse {
  statusCode: number;
  /** Машинный код для i18n на клиенте, например `waybill.already_closed` */
  code: string;
  message: string;
  /** Ошибки валидации по полям */
  details?: Record<string, string[]>;
  timestamp: string;
  path: string;
  /** Для поиска в логах */
  requestId: string;
}

/** Полезная нагрузка access-токена. */
export interface JwtAccessPayload {
  /** user id */
  sub: number;
  email: string;
  /** Активный офис — тот, в контексте которого пользователь работает сейчас */
  officeId: number;
  /**
   * Офисы, данные которых пользователь вправе видеть.
   * Для сотрудника аэропорта — один; для головного офиса — все дочерние.
   * Ровно этот список уходит в RLS-переменную app.office_ids.
   */
  officeScope: number[];
  /** Обход RLS. Только у SUPER_ADMIN. */
  bypassRls: boolean;
  permissions: Permission[];
  /** Версия сессии — инкремент инвалидирует все выданные токены пользователя */
  sv: number;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  sub: number;
  /** id записи refresh-токена в БД, чтобы можно было отозвать конкретную сессию */
  jti: string;
  sv: number;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface CurrentUserDto {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  locale: string;
  activeOffice: OfficeSummaryDto;
  /** Офисы, между которыми пользователь может переключаться в интерфейсе */
  availableOffices: OfficeSummaryDto[];
  roles: string[];
  permissions: Permission[];
}

export interface OfficeSummaryDto {
  id: number;
  code: string;
  name: string;
  iataCode: string | null;
  timezone: string;
  kind: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  /** Если не указан — берётся офис по умолчанию из профиля */
  officeId?: number;
}

/** Элемент дашборда «истекающие сроки» — сводит документы техники и допуски водителей. */
export interface ExpiryAlertDto {
  entityType: 'VEHICLE_DOCUMENT' | 'DRIVER_LICENSE' | 'DRIVER_PERMIT' | 'MEDICAL_CHECK';
  entityId: number;
  subjectId: number;
  subjectLabel: string;
  documentType: string;
  documentNumber: string | null;
  expiresAt: string;
  daysLeft: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}
