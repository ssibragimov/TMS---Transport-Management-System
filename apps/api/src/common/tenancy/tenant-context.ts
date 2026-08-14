import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Контекст текущего запроса. Живёт в AsyncLocalStorage, поэтому доступен
 * в любом слое без протаскивания параметром через все сервисы.
 *
 * Заполняется TenantInterceptor сразу после аутентификации и читается
 * расширением Prisma, которое выставляет переменные сессии PostgreSQL для RLS.
 */
export interface TenantContext {
  /** Офис, в контексте которого пользователь работает сейчас. */
  officeId: number;
  /**
   * Офисы, данные которых пользователь вправе видеть.
   * Уходит в переменную app.office_ids.
   */
  officeScope: number[];
  /** Обход RLS. Только для SUPER_ADMIN и фоновых задач. */
  bypassRls: boolean;
  userId: number | null;
  /** Сквозной идентификатор запроса — им связываются логи, аудит и ответ об ошибке. */
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  /**
   * Выставляется PrismaService на время интерактивной транзакции.
   * Пока флаг взведён, расширение RLS не оборачивает каждый запрос в свою
   * batch-транзакцию — переменные сессии уже выставлены на соединении транзакции.
   */
  inManagedTransaction?: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

export const TenantStore = {
  /** Выполнить колбэк в заданном контексте. */
  run<T>(context: TenantContext, callback: () => T): T {
    return storage.run(context, callback);
  },

  /** Текущий контекст или undefined (публичные маршруты, запуск CLI). */
  get(): TenantContext | undefined {
    return storage.getStore();
  },

  /**
   * Дозаполнить контекст после аутентификации.
   *
   * Контекст создаётся middleware (до guard'ов) пустым, потому что
   * AsyncLocalStorage.run должен обернуть весь дальнейший конвейер обработки.
   * Guard, проверивший токен, дописывает в тот же объект данные пользователя.
   */
  hydrate(patch: Partial<TenantContext>): void {
    const current = storage.getStore();
    if (!current) return;
    Object.assign(current, patch);
  },

  /** Текущий контекст; бросает, если его нет. Для кода, который без него бессмыслен. */
  require(): TenantContext {
    const context = storage.getStore();
    if (!context) {
      throw new Error(
        'Контекст арендатора отсутствует. Операция вызвана вне HTTP-запроса — ' +
          'используйте TenantStore.runAsSystem() для фоновых задач.',
      );
    }
    return context;
  },

  /**
   * Контекст для фоновых задач (планировщик, обработка очередей, миграции данных).
   * bypassRls = true, потому что ночной пересчёт алертов идёт по всем офисам сразу.
   */
  runAsSystem<T>(callback: () => T, requestId = 'system'): T {
    return storage.run(
      {
        officeId: 0,
        officeScope: [],
        bypassRls: true,
        userId: null,
        requestId,
      },
      callback,
    );
  },

  /**
   * Пометить текущий контекст как находящийся внутри управляемой транзакции.
   * Вызывается только из PrismaService.transaction().
   */
  runInManagedTransaction<T>(callback: () => T): T {
    const current = storage.getStore();
    if (!current) return callback();
    return storage.run({ ...current, inManagedTransaction: true }, callback);
  },

  /**
   * Контекст конкретного офиса без пользователя — для задач, которые должны
   * выполняться строго в пределах одного аэропорта.
   */
  runAsOffice<T>(officeId: number, callback: () => T, requestId = 'system'): T {
    return storage.run(
      {
        officeId,
        officeScope: [officeId],
        bypassRls: false,
        userId: null,
        requestId,
      },
      callback,
    );
  },
};
