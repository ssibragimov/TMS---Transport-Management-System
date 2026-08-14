import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { PaginatedResult } from '@gsm/shared';

import { APP_CONFIG, type AppConfig } from '@/config/configuration';
import { paginate } from '@/common/dto/pagination.dto';
import {
  PrismaService,
  type PrismaTransactionClient,
} from '@/common/prisma/prisma.service';
import { TenantStore } from '@/common/tenancy/tenant-context';

import type {
  CreateUserDto,
  OfficeAssignmentDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Офисы, которыми текущий пользователь вправе распоряжаться.
   *
   * Администратор аэропорта не должен выдавать доступ к чужому аэропорту,
   * даже подставив нужный officeId в запрос. Проверка здесь, а не только
   * в интерфейсе: форма — не граница безопасности.
   */
  private assertOfficesAllowed(officeIds: number[]): void {
    const context = TenantStore.require();
    if (context.bypassRls) return;

    const allowed = new Set(context.officeScope);
    const forbidden = officeIds.filter((id) => !allowed.has(id));

    if (forbidden.length > 0) {
      throw new ForbiddenException({
        code: 'user.office_not_allowed',
        message: 'Нет прав назначать доступ к выбранным офисам',
        details: { offices: forbidden.map(String) },
      });
    }
  }

  private scopeOf(): { bypass: boolean; officeIds: number[] } {
    const context = TenantStore.require();
    return { bypass: context.bypassRls, officeIds: context.officeScope };
  }

  async list(
    officeId: number,
    query: UserQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const { bypass, officeIds } = this.scopeOf();

    // По умолчанию — пользователи активного офиса. Головной офис может
    // запросить всех в своей области видимости одним списком.
    const officeFilter = query.allOffices
      ? bypass
        ? undefined
        : { officeId: { in: officeIds } }
      : { officeId };

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(officeFilter && { offices: { some: officeFilter } }),
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    // Список пользователей идёт в системном контексте: RLS на таблице users
    // показывает только тех, кто пересекается с областью видимости, а фильтр
    // по офису мы и так строим явно выше.
    return TenantStore.runAsSystem(async () => {
      const [items, total] = await Promise.all([
        this.prisma.db.user.findMany({
          where,
          skip: query.skip,
          take: query.take,
          orderBy: query.orderBy(['fullName', 'email', 'createdAt', 'lastLoginAt'], 'fullName'),
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            status: true,
            locale: true,
            bypassRls: true,
            lastLoginAt: true,
            defaultOfficeId: true,
            offices: {
              select: { office: { select: { id: true, code: true, nameRu: true } } },
            },
            roles: {
              select: {
                officeId: true,
                role: { select: { id: true, code: true, name: true } },
              },
            },
          },
        }),
        this.prisma.db.user.count({ where }),
      ]);

      return paginate(items, total, query);
    });
  }

  async findOne(id: number) {
    return TenantStore.runAsSystem(async () => {
      const user = await this.prisma.db.user.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          status: true,
          locale: true,
          bypassRls: true,
          lastLoginAt: true,
          defaultOfficeId: true,
          createdAt: true,
          offices: { select: { office: { select: { id: true, code: true, nameRu: true } } } },
          roles: {
            select: { officeId: true, role: { select: { id: true, code: true, name: true } } },
          },
        },
      });

      if (!user) {
        throw new NotFoundException({ code: 'user.not_found', message: 'Пользователь не найден' });
      }

      this.assertVisible(user.offices.map((o) => o.office.id));
      return user;
    });
  }

  /** Пользователь виден, если хотя бы один его офис входит в область видимости. */
  private assertVisible(userOfficeIds: number[]): void {
    const { bypass, officeIds } = this.scopeOf();
    if (bypass) return;

    const allowed = new Set(officeIds);
    if (!userOfficeIds.some((id) => allowed.has(id))) {
      throw new NotFoundException({
        code: 'user.not_found',
        message: 'Пользователь не найден',
      });
    }
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.toLowerCase().trim();
    const officeIds = [...new Set(dto.offices.map((o) => o.officeId))];

    this.assertOfficesAllowed(officeIds);

    const defaultOfficeId = dto.defaultOfficeId ?? officeIds[0];
    if (!officeIds.includes(defaultOfficeId)) {
      throw new BadRequestException({
        code: 'user.default_office_not_assigned',
        message: 'Офис по умолчанию должен быть среди назначенных',
      });
    }

    // Учётные записи глобальны: проверка уникальности почты и создание связей
    // затрагивают офисы, часть которых может быть вне области видимости RLS.
    return this.prisma.systemTransaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        throw new ConflictException({
          code: 'user.email_taken',
          message: 'Пользователь с такой почтой уже существует',
        });
      }

      const offices = await tx.office.findMany({
        where: { id: { in: officeIds }, deletedAt: null },
        select: { id: true },
      });
      if (offices.length !== officeIds.length) {
        throw new BadRequestException({
          code: 'office.not_found',
          message: 'Один или несколько офисов не найдены',
        });
      }

      const roleIdByCode = await this.resolveRoles(tx, dto.offices);

      const user = await tx.user.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(dto.password, this.config.security.bcryptRounds),
          fullName: dto.fullName,
          phone: dto.phone ?? null,
          locale: dto.locale ?? 'ru',
          status: dto.status ?? UserStatus.ACTIVE,
          defaultOfficeId,
          // bypassRls намеренно не выставляется через API ни при каких условиях:
          // обход изоляции офисов — свойство технической учётки, которое
          // задаётся только seed'ом или вручную в БД.
          offices: { create: officeIds.map((officeId) => ({ officeId })) },
          roles: {
            create: dto.offices.flatMap((assignment) =>
              assignment.roleCodes.map((code) => ({
                roleId: roleIdByCode.get(code)!,
                officeId: assignment.officeId,
              })),
            ),
          },
        },
        select: { id: true, email: true, fullName: true, status: true },
      });

      return user;
    });
  }

  async update(id: number, dto: UpdateUserDto) {
    const current = await this.findOne(id);

    if (dto.offices) {
      this.assertOfficesAllowed(dto.offices.map((o) => o.officeId));
    }

    if (dto.defaultOfficeId !== undefined) {
      const assigned = dto.offices
        ? dto.offices.map((o) => o.officeId)
        : current.offices.map((o) => o.office.id);
      if (!assigned.includes(dto.defaultOfficeId)) {
        throw new BadRequestException({
          code: 'user.default_office_not_assigned',
          message: 'Офис по умолчанию должен быть среди назначенных',
        });
      }
    }

    return this.prisma.systemTransaction(async (tx) => {
      if (dto.offices) {
        const { bypass, officeIds } = this.scopeOf();
        const manageable = new Set(officeIds);
        const nextOfficeIds = [...new Set(dto.offices.map((o) => o.officeId))];

        // Переназначаются только офисы в пределах полномочий актора.
        // Назначения в других аэропортах остаются нетронутыми: администратор
        // Бухары не должен случайно отобрать у человека доступ к Ташкенту.
        const existingOfficeIds = current.offices.map((o) => o.office.id);
        const untouched = bypass
          ? []
          : existingOfficeIds.filter((officeId) => !manageable.has(officeId));

        const finalOfficeIds = [...new Set([...nextOfficeIds, ...untouched])];

        await tx.userOffice.deleteMany({
          where: {
            userId: id,
            officeId: { notIn: finalOfficeIds.length > 0 ? finalOfficeIds : [0] },
          },
        });
        await tx.userOffice.createMany({
          data: finalOfficeIds.map((officeId) => ({ userId: id, officeId })),
          skipDuplicates: true,
        });

        const roleIdByCode = await this.resolveRoles(tx, dto.offices);

        // Перестраиваются назначения и в новых офисах, и в снятых.
        // Без второй части роль в отвязанном офисе осталась бы висеть
        // сиротой и молча вернулась бы, если человека позже вернут туда же.
        const removedOfficeIds = existingOfficeIds.filter(
          (officeId) => !finalOfficeIds.includes(officeId),
        );
        const officesToRebuild = [...new Set([...nextOfficeIds, ...removedOfficeIds])];

        if (officesToRebuild.length > 0) {
          // Роли с office_id = NULL (глобальные, как у суперадминистратора)
          // под условие не попадают и остаются нетронутыми.
          await tx.userRole.deleteMany({
            where: { userId: id, officeId: { in: officesToRebuild } },
          });
        }
        const roleRows = dto.offices.flatMap((assignment) =>
          assignment.roleCodes.map((code) => ({
            userId: id,
            roleId: roleIdByCode.get(code)!,
            officeId: assignment.officeId,
          })),
        );
        if (roleRows.length > 0) {
          await tx.userRole.createMany({ data: roleRows, skipDuplicates: true });
        }
      }

      const deactivating =
        dto.status !== undefined && dto.status !== UserStatus.ACTIVE;

      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(dto.fullName !== undefined && { fullName: dto.fullName }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.locale !== undefined && { locale: dto.locale }),
          ...(dto.defaultOfficeId !== undefined && { defaultOfficeId: dto.defaultOfficeId }),
          ...(dto.status !== undefined && { status: dto.status }),
          // Блокировка и смена набора ролей должны действовать сразу:
          // инкремент версии сессии обрывает продление токенов.
          ...((deactivating || dto.offices) && { sessionVersion: { increment: 1 } }),
        },
        select: { id: true, email: true, fullName: true, status: true },
      });

      if (deactivating) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return updated;
    });
  }

  /**
   * Сброс пароля администратором.
   * Завершает все сессии пользователя — иначе тот, кто увёл учётку,
   * продолжит работать со старым токеном.
   */
  async resetPassword(id: number, password: string) {
    await this.findOne(id);

    return this.prisma.systemTransaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash: await bcrypt.hash(password, this.config.security.bcryptRounds),
          sessionVersion: { increment: 1 },
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { success: true as const };
    });
  }

  async remove(id: number) {
    const user = await this.findOne(id);

    const self = TenantStore.require().userId;
    if (self === id) {
      throw new ConflictException({
        code: 'user.cannot_delete_self',
        message: 'Нельзя удалить собственную учётную запись',
      });
    }
    if (user.bypassRls) {
      throw new ConflictException({
        code: 'user.cannot_delete_superadmin',
        message: 'Техническую учётную запись нельзя удалить через интерфейс',
      });
    }

    return this.prisma.systemTransaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: UserStatus.SUSPENDED,
          sessionVersion: { increment: 1 },
        },
        select: { id: true, email: true },
      });
    });
  }

  /** Коды ролей → id. Отсутствие любой из ролей — ошибка, а не тихий пропуск. */
  private async resolveRoles(
    tx: PrismaTransactionClient,
    assignments: OfficeAssignmentDto[],
  ): Promise<Map<string, number>> {
    const codes = [...new Set(assignments.flatMap((a) => a.roleCodes))];
    if (codes.length === 0) return new Map();

    const roles = await tx.role.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });

    if (roles.length !== codes.length) {
      const found = new Set(roles.map((r) => r.code));
      throw new BadRequestException({
        code: 'user.unknown_role',
        message: 'Одна или несколько ролей не найдены',
        details: { roles: codes.filter((c) => !found.has(c)) },
      });
    }

    return new Map(roles.map((r) => [r.code, r.id]));
  }
}
