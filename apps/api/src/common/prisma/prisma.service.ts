import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { APP_CONFIG, type AppConfig } from '@/config/configuration';
import { TenantStore } from '@/common/tenancy/tenant-context';

/**
 * Клиент с наложенным расширением RLS.
 * Тип выводится из фабрики — писать его руками бессмысленно, он огромный.
 */
export type TenantPrismaClient = ReturnType<PrismaService['buildExtendedClient']>;

/**
 * Транзакционный клиент. Внутри transaction() отдаётся «сырой» клиент Prisma:
 * переменные сессии уже выставлены на соединении, повторно оборачивать не нужно.
 */
export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Клиент для обычных запросов. Каждая операция автоматически выполняется
   * с выставленными переменными app.office_ids / app.bypass_rls.
   *
   * В сервисах обращайтесь ТОЛЬКО к `prisma.db.*`, `prisma.transaction()`
   * или `prisma.systemTransaction()`. Прямой вызов `prisma.user.findMany()`
   * компилируется (PrismaService наследует PrismaClient), но идёт мимо
   * расширения: переменные сессии не выставляются, и политика RLS вернёт
   * пустую выборку. Симптом обманчив — «пользователь не найден», «список пуст»,
   * а не ошибка доступа.
   */
  readonly db: TenantPrismaClient;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super({
      // Рантайм подключается прикладной ролью — на неё действуют политики RLS.
      datasources: { db: { url: config.database.appUrl } },
      log:
        config.env === 'development'
          ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
          : ['warn', 'error'],
    });

    this.db = this.buildExtendedClient();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.assertRlsIsEffective();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Проверка, что изоляция офисов действительно работает.
   *
   * Ошибка конфигурации здесь не даёт ни одного видимого симптома: приложение
   * работает, тесты проходят, а пользователь Бухары тихо видит Ташкент.
   * Поэтому проверяем явно на старте.
   */
  private async assertRlsIsEffective(): Promise<void> {
    if (this.config.database.rlsDisabled) {
      this.logger.error(
        'APP_DATABASE_URL не задан — API подключается владельцем схемы. ' +
          'Политики RLS на владельца не действуют, изоляция офисов ОТКЛЮЧЕНА.',
      );
      if (this.config.isProduction) {
        throw new Error('APP_DATABASE_URL обязателен в production');
      }
      return;
    }

    const [{ is_superuser, current_user }] = await this.$queryRaw<
      { is_superuser: boolean; current_user: string }[]
    >`SELECT usesuper AS is_superuser, current_user::text AS current_user
      FROM pg_user WHERE usename = current_user`;

    if (is_superuser) {
      const message =
        `Роль ${current_user} — суперпользователь. PostgreSQL не применяет ` +
        'к ней политики RLS, изоляция офисов не работает.';
      this.logger.error(message);
      if (this.config.isProduction) throw new Error(message);
      return;
    }

    this.logger.log(`RLS активен, соединение под ролью ${current_user}`);
  }

  /**
   * Расширение, выставляющее переменные сессии PostgreSQL перед каждым запросом.
   *
   * Приём с батч-транзакцией из двух инструкций — единственный способ
   * гарантировать, что set_config и сам запрос уйдут в одно соединение:
   * пул Prisma не даёт закрепить соединение за запросом иначе.
   * `set_config(..., true)` действует только до конца транзакции, поэтому
   * настройки не протекают на следующий запрос из того же соединения.
   */
  // Не private: из типа этого метода выводится TenantPrismaClient,
  // а индексный доступ к приватным членам TypeScript не допускает.
  buildExtendedClient() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    return this.$extends({
      name: 'rls',
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const context = TenantStore.get();

            // Нет контекста — запрос вне HTTP (CLI, seed). Политики оставят
            // пустую выборку для прикладной роли, и это правильно.
            if (!context) return query(args);

            // Уже внутри управляемой транзакции: переменные выставлены,
            // вложенная транзакция здесь только сломает атомарность.
            if (context.inManagedTransaction) return query(args);

            const officeIds = context.officeScope.join(',');
            const bypass = context.bypassRls ? 'on' : 'off';

            const [, result] = await self.$transaction([
              self.$executeRaw`
                SELECT set_config('app.office_ids', ${officeIds}, TRUE),
                       set_config('app.bypass_rls', ${bypass}, TRUE)
              `,
              query(args) as Prisma.PrismaPromise<unknown>,
            ]);

            return result;
          },
        },
      },
    });
  }

  /**
   * Интерактивная транзакция с корректным контекстом RLS.
   *
   * Переменные сессии выставляются один раз на соединении транзакции,
   * дальше все запросы внутри неё автоматически ограничены офисом.
   *
   * @example
   * await prisma.transaction(async (tx) => {
   *   await tx.fuelTank.update({ ... });
   *   await tx.fuelIssue.create({ ... });
   * });
   */
  async transaction<T>(
    handler: (tx: PrismaTransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    const context = TenantStore.get();

    return this.$transaction(async (tx) => {
      if (context) {
        const officeIds = context.officeScope.join(',');
        const bypass = context.bypassRls ? 'on' : 'off';
        await tx.$executeRaw`
          SELECT set_config('app.office_ids', ${officeIds}, TRUE),
                 set_config('app.bypass_rls', ${bypass}, TRUE)
        `;
      }

      return TenantStore.runInManagedTransaction(() => handler(tx));
    }, options);
  }

  /**
   * Транзакция в обход RLS. Только для служебных операций:
   * ночные пересчёты по всем офисам, миграции данных, консолидированные отчёты.
   * Каждое использование должно быть обосновано в комментарии на месте вызова.
   */
  async systemTransaction<T>(
    handler: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return TenantStore.runInManagedTransaction(() => handler(tx));
    });
  }
}
