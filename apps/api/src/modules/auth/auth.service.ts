import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OfficeKind, Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { SYSTEM_ROLES } from '@gsm/shared';
import type {
  AuthTokens,
  CurrentUserDto,
  JwtAccessPayload,
  JwtRefreshPayload,
  OfficeSummaryDto,
  Permission,
} from '@gsm/shared';

import { APP_CONFIG, type AppConfig } from '@/config/configuration';
import { PrismaService } from '@/common/prisma/prisma.service';
import { TenantStore } from '@/common/tenancy/tenant-context';

import type { ChangePasswordDto, LoginDto } from './dto/auth.dto';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Вход в систему.
   *
   * Читает пользователя в системном контексте: на момент проверки пароля
   * пользователь ещё не аутентифицирован, область видимости офисов неизвестна,
   * и политики RLS не дали бы прочитать даже его собственную учётку.
   */
  async login(dto: LoginDto): Promise<AuthTokens & { user: CurrentUserDto }> {
    return TenantStore.runAsSystem(async () => {
      const user = await this.prisma.db.user.findUnique({
        where: { email: dto.email.toLowerCase().trim() },
        include: {
          offices: { include: { office: true } },
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      });

      // Одинаковая ошибка для «нет такого пользователя» и «неверный пароль»:
      // иначе форма входа превращается в перебор существующих адресов.
      const invalid = new UnauthorizedException({
        code: 'auth.invalid_credentials',
        message: 'Неверный адрес электронной почты или пароль',
      });

      if (!user || user.deletedAt) throw invalid;

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new ForbiddenException({
          code: 'auth.account_locked',
          message: `Учётная запись временно заблокирована до ${user.lockedUntil.toISOString()}`,
        });
      }

      const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
      if (!passwordOk) {
        await this.registerFailedLogin(user.id, user.failedLoginCount);
        throw invalid;
      }

      if (user.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException({
          code: 'auth.account_inactive',
          message: 'Учётная запись не активирована или заблокирована',
        });
      }

      const availableOffices = await this.accessibleOffices(user.id, user.bypassRls);
      if (availableOffices.length === 0) {
        throw new ForbiddenException({
          code: 'auth.no_office',
          message: 'Пользователю не назначен ни один офис — обратитесь к администратору',
        });
      }

      const activeOfficeId =
        dto.officeId ?? user.defaultOfficeId ?? availableOffices[0].id;

      const activeOffice = availableOffices.find((o) => o.id === activeOfficeId);
      if (!activeOffice) {
        throw new ForbiddenException({
          code: 'auth.office_not_allowed',
          message: 'Нет доступа к выбранному офису',
        });
      }

      await this.prisma.db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
      });

      return this.issueSession(user.id, activeOffice.id);
    });
  }

  /** Переключение активного офиса без повторного ввода пароля. */
  async switchOffice(userId: number, officeId: number): Promise<AuthTokens & { user: CurrentUserDto }> {
    return TenantStore.runAsSystem(async () => {
      const user = await this.prisma.db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { bypassRls: true },
      });

      // Проверка тем же способом, каким строится список в шапке: иначе
      // суперадминистратор видел бы новый аэропорт, но не мог бы в него войти.
      const allowed = await this.accessibleOffices(userId, user.bypassRls);
      if (!allowed.some((office) => office.id === officeId)) {
        throw new ForbiddenException({
          code: 'auth.office_not_allowed',
          message: 'Нет доступа к выбранному офису',
        });
      }
      return this.issueSession(userId, officeId);
    });
  }

  async refresh(refreshToken: string): Promise<AuthTokens & { user: CurrentUserDto }> {
    return TenantStore.runAsSystem(async () => {
      let payload: JwtRefreshPayload;
      try {
        payload = await this.jwt.verifyAsync<JwtRefreshPayload>(refreshToken, {
          secret: this.config.jwt.refreshSecret,
        });
      } catch {
        throw new UnauthorizedException({
          code: 'auth.invalid_refresh_token',
          message: 'Сессия истекла, войдите заново',
        });
      }

      const stored = await this.prisma.db.refreshToken.findUnique({
        where: { id: payload.jti },
        include: { user: true },
      });

      const invalid = new UnauthorizedException({
        code: 'auth.invalid_refresh_token',
        message: 'Сессия истекла, войдите заново',
      });

      if (!stored || stored.revokedAt || stored.expiresAt < new Date()) throw invalid;
      if (stored.tokenHash !== this.hashToken(refreshToken)) throw invalid;
      // Смена пароля или отзыв прав инкрементит session_version —
      // все ранее выданные токены перестают работать немедленно.
      if (stored.user.sessionVersion !== payload.sv) throw invalid;

      // Ротация: использованный refresh-токен отзывается сразу.
      // Повторное предъявление того же токена означает утечку.
      await this.prisma.db.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      return this.issueSession(stored.userId, stored.officeId);
    });
  }

  async logout(refreshToken: string): Promise<{ success: true }> {
    return TenantStore.runAsSystem(async () => {
      try {
        const payload = await this.jwt.verifyAsync<JwtRefreshPayload>(refreshToken, {
          secret: this.config.jwt.refreshSecret,
        });
        await this.prisma.db.refreshToken.updateMany({
          where: { id: payload.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      } catch {
        // Выход с недействительным токеном — не ошибка: цель достигнута.
      }
      return { success: true as const };
    });
  }

  async changePassword(userId: number, dto: ChangePasswordDto): Promise<{ success: true }> {
    return TenantStore.runAsSystem(async () => {
      const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });

      const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!ok) {
        throw new UnauthorizedException({
          code: 'auth.wrong_current_password',
          message: 'Текущий пароль указан неверно',
        });
      }

      const hash = await bcrypt.hash(dto.newPassword, this.config.security.bcryptRounds);

      await this.prisma.transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          // Инкремент session_version разлогинивает все устройства.
          data: { passwordHash: hash, sessionVersion: { increment: 1 } },
        });
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      });

      return { success: true as const };
    });
  }

  /** Профиль текущего пользователя для интерфейса. */
  async me(userId: number, officeId: number): Promise<CurrentUserDto> {
    return TenantStore.runAsSystem(() => this.buildCurrentUser(userId, officeId));
  }

  // ─── Внутреннее ──────────────────────────────────────────────────────────

  private async issueSession(
    userId: number,
    officeId: number,
  ): Promise<AuthTokens & { user: CurrentUserDto }> {
    const profile = await this.buildCurrentUser(userId, officeId);
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });

    const officeScope = await this.resolveOfficeScope(userId, officeId, user.bypassRls);

    const accessPayload: JwtAccessPayload = {
      sub: userId,
      email: profile.email,
      officeId,
      officeScope,
      bypassRls: user.bypassRls,
      permissions: profile.permissions,
      sv: user.sessionVersion,
    };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: this.config.jwt.accessTtl,
    });

    const jti = randomUUID();
    const refreshPayload: JwtRefreshPayload = { sub: userId, jti, sv: user.sessionVersion };
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.jwt.refreshSecret,
      expiresIn: this.config.jwt.refreshTtl,
    });

    const context = TenantStore.get();
    await this.prisma.db.refreshToken.create({
      data: {
        id: jti,
        userId,
        officeId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: this.expiryFromTtl(this.config.jwt.refreshTtl),
        userAgent: context?.userAgent?.slice(0, 400) ?? null,
        ipAddress: context?.ipAddress ?? null,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.ttlSeconds(this.config.jwt.accessTtl),
      user: profile,
    };
  }

  /**
   * Какие офисы видит пользователь в этой сессии.
   *
   * Сотрудник аэропорта — только свой. Сотрудник головного офиса,
   * работающий в контексте головного офиса, — весь Узбекистан: иначе
   * сводный отчёт по стране собрать нечем.
   */
  /**
   * Офисы, доступные пользователю.
   *
   * Суперадминистратор (bypassRls) получает все действующие офисы, а не только
   * те, на которые заведены записи в user_offices. Иначе созданный аэропорт не
   * появлялся бы в переключателе до тех пор, пока кому-то не проставят связь
   * вручную, — а создавший его администратор как раз и не смог бы туда войти.
   *
   * Остальным доступ по-прежнему даётся явной записью: это и есть разграничение
   * между аэропортами.
   */
  private async accessibleOffices(userId: number, bypassRls: boolean) {
    if (bypassRls || (await this.holdsSuperAdminRole(userId))) {
      return this.prisma.db.office.findMany({
        where: { deletedAt: null, isActive: true, organization: { isActive: true } },
        include: { organization: true },
        orderBy: [{ organization: { nameRu: 'asc' } }, { kind: 'asc' }, { code: 'asc' }],
      });
    }

    // Офисы по явной записи плюс все офисы организаций, которыми человек
    // управляет: новый офис такой организации доступен ему сразу.
    const adminOrganizationIds = await this.adminOrganizationIds(userId);

    return this.prisma.db.office.findMany({
      // Отключённый офис недоступен и по явной записи: отключение означает,
      // что аэропорт больше не работает, а не что его просто скрыли из списка.
      where: {
        deletedAt: null,
        isActive: true,
        organization: { isActive: true },
        OR: [
          { userOffices: { some: { userId } } },
          { organizationId: { in: adminOrganizationIds } },
        ],
      },
      include: { organization: true },
      orderBy: [{ kind: 'asc' }, { code: 'asc' }],
    });
  }

  /** Организации, администратором которых является пользователь. */
  private async adminOrganizationIds(userId: number): Promise<number[]> {
    const rows = await this.prisma.db.userOrganization.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    return rows.map((row) => row.organizationId);
  }

  /**
   * Суперадминистратор — свойство человека, а не отдельного офиса: роль,
   * выданная где угодно, открывает все офисы платформы, в том числе созданные
   * позже. Иначе каждому новому офису пришлось бы вручную проставлять доступ.
   */
  private async holdsSuperAdminRole(userId: number): Promise<boolean> {
    const assignment = await this.prisma.db.userRole.findFirst({
      where: { userId, role: { code: SYSTEM_ROLES.SUPER_ADMIN } },
      select: { userId: true },
    });
    return assignment !== null;
  }

  private async resolveOfficeScope(
    userId: number,
    activeOfficeId: number,
    bypassRls: boolean,
  ): Promise<number[]> {
    if (bypassRls) return [];

    const office = await this.prisma.db.office.findUniqueOrThrow({
      where: { id: activeOfficeId },
      select: { id: true, kind: true, organizationId: true },
    });

    // Администратор организации, работающий в её офисе, видит данные всех офисов
    // этой организации сразу — общие отчёты и управление людьми без переключений.
    const adminOrganizationIds = await this.adminOrganizationIds(userId);
    if (adminOrganizationIds.includes(office.organizationId)) {
      const organizationOffices = await this.prisma.db.office.findMany({
        where: { organizationId: office.organizationId, deletedAt: null },
        select: { id: true },
      });
      return organizationOffices.map((o) => o.id);
    }

    if (office.kind !== OfficeKind.HEADQUARTERS) return [office.id];

    // Головной офис: он сам плюс все дочерние.
    // Иерархия сейчас двухуровневая; если появится третий уровень,
    // здесь понадобится рекурсивный CTE.
    const children = await this.prisma.db.office.findMany({
      where: { parentId: office.id, deletedAt: null },
      select: { id: true },
    });

    const scope = [office.id, ...children.map((c) => c.id)];
    this.logger.debug(`Область видимости пользователя ${userId}: ${scope.join(', ')}`);
    return scope;
  }

  private async buildCurrentUser(userId: number, officeId: number): Promise<CurrentUserDto> {
    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        offices: { include: { office: true } },
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });

    // Учитываются роли, выданные глобально (office_id IS NULL), роли активного
    // офиса и роль суперадминистратора, выданная где угодно: она действует
    // во всех офисах платформы.
    const applicableRoles = user.roles.filter(
      (ur) =>
        ur.officeId === null ||
        ur.officeId === officeId ||
        ur.role.code === SYSTEM_ROLES.SUPER_ADMIN,
    );

    const availableRaw = await this.accessibleOffices(user.id, user.bypassRls);
    const activeRaw = availableRaw.find((o) => o.id === officeId) ?? availableRaw[0];

    // Администратор организации получает права роли ORG_ADMIN в офисах своей
    // организации — и только в них.
    const adminOrganizationIds = await this.adminOrganizationIds(user.id);
    const isOrgAdminHere =
      activeRaw !== undefined && adminOrganizationIds.includes(activeRaw.organizationId);
    const orgAdminRole = isOrgAdminHere
      ? await this.prisma.db.role.findUnique({
          where: { code: SYSTEM_ROLES.ORG_ADMIN },
          include: { permissions: { include: { permission: true } } },
        })
      : null;

    const permissions = [
      ...new Set([
        ...applicableRoles.flatMap((ur) =>
          ur.role.permissions.map((rp) => rp.permission.code as Permission),
        ),
        ...(orgAdminRole?.permissions.map((rp) => rp.permission.code as Permission) ?? []),
      ]),
    ];

    const toSummary = (o: {
      id: number;
      code: string;
      nameRu: string;
      iataCode: string | null;
      timezone: string;
      kind: string;
      latitude: Prisma.Decimal | null;
      longitude: Prisma.Decimal | null;
      taskLayout: string | null;
      taskAddressALocations: boolean | null;
      organization: {
        id: number;
        code: string;
        nameRu: string;
        taskLayout: string;
        taskAddressALocations: boolean;
      };
    }): OfficeSummaryDto => ({
      id: o.id,
      code: o.code,
      name: o.nameRu,
      organization: {
        id: o.organization.id,
        code: o.organization.code,
        name: o.organization.nameRu,
      },
      iataCode: o.iataCode,
      timezone: o.timezone,
      kind: o.kind,
      // Decimal из Prisma сериализуется в строку — карта ждёт число.
      latitude: o.latitude === null ? null : Number(o.latitude),
      longitude: o.longitude === null ? null : Number(o.longitude),
      // Собственная раскладка офиса главнее; иначе — как у организации.
      taskLayout: o.taskLayout ?? o.organization.taskLayout,
      taskAddressALocations: o.taskAddressALocations ?? o.organization.taskAddressALocations,
    });

    const availableOffices = availableRaw.map(toSummary);
    const activeOffice =
      availableOffices.find((o) => o.id === officeId) ?? availableOffices[0];

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      internalNumber: user.internalNumber,
      phone: user.phone,
      photoKey: user.photoKey,
      locale: user.locale,
      activeOffice,
      availableOffices,
      roles: [
        ...applicableRoles.map((ur) => ur.role.code),
        ...(orgAdminRole ? [orgAdminRole.code] : []),
      ],
      permissions,
    };
  }

  private async registerFailedLogin(userId: number, current: number): Promise<void> {
    const next = current + 1;
    await this.prisma.db.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: next,
        lockedUntil:
          next >= MAX_FAILED_LOGINS
            ? new Date(Date.now() + LOCK_MINUTES * 60_000)
            : null,
      },
    });
  }

  /** В БД хранится хеш, а не сам refresh-токен: утечка дампа не даёт войти. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private ttlSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 900;
    const value = Number(match[1]);
    const factor = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd'];
    return value * factor;
  }

  private expiryFromTtl(ttl: string): Date {
    return new Date(Date.now() + this.ttlSeconds(ttl) * 1000);
  }
}
