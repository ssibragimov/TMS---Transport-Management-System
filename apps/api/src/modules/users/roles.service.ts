import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ALL_PERMISSIONS, type Permission } from '@gsm/shared';

import { PrismaService } from '@/common/prisma/prisma.service';

/** Человекочитаемые названия групп прав — для экрана настройки ролей. */
const GROUP_LABELS: Record<string, string> = {
  office: 'Офисы',
  dictionary: 'Справочники',
  user: 'Пользователи',
  role: 'Роли',
  vehicle: 'Транспорт',
  driver: 'Водители',
  fuel: 'ГСМ',
  waybill: 'Путевые листы',
  maintenance: 'ТО и ремонты',
  workorder: 'Наряд-заказы',
  sparepart: 'Запчасти',
  telemetry: 'Телематика',
  geofence: 'Геозоны',
  report: 'Отчёты',
  audit: 'Аудит',
};

/** Пояснения к правам, смысл которых не считывается из кода. */
const PERMISSION_HINTS: Record<string, string> = {
  'vehicle.transfer': 'Передача техники в другой аэропорт',
  'vehicle.meter.adjust': 'Корректировка показаний счётчиков',
  'fuel.norm.manage': 'Правка норм расхода — влияет на все расчёты',
  'waybill.reopen': 'Изменение уже закрытого путевого листа',
  'report.cross_office': 'Сводные отчёты по всем аэропортам страны',
};

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Роли — общие для всей страны, RLS на них не действует.
   * Это осознанно: единый набор ролей делает сравнимыми права сотрудников
   * разных аэропортов, а привязка роли к офису живёт в user_roles.
   */
  list() {
    return this.prisma.db.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        isSystem: true,
        permissions: { select: { permission: { select: { code: true } } } },
        _count: { select: { users: true } },
      },
    });
  }

  /** Каталог прав, сгруппированный для интерфейса. */
  async permissions() {
    const rows = await this.prisma.db.permission.findMany({
      orderBy: [{ groupCode: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, groupCode: true },
    });

    const groups = new Map<string, Array<{ code: string; hint?: string }>>();
    for (const row of rows) {
      const list = groups.get(row.groupCode) ?? [];
      list.push({ code: row.code, hint: PERMISSION_HINTS[row.code] });
      groups.set(row.groupCode, list);
    }

    return [...groups.entries()].map(([groupCode, items]) => ({
      groupCode,
      label: GROUP_LABELS[groupCode] ?? groupCode,
      permissions: items,
    }));
  }

  async create(dto: { code: string; name: string; permissions: string[] }) {
    const existing = await this.prisma.db.role.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException({
        code: 'role.code_taken',
        message: `Роль с кодом ${dto.code} уже существует`,
      });
    }

    const permissionIds = await this.resolvePermissions(dto.permissions);

    return this.prisma.db.role.create({
      data: {
        code: dto.code,
        name: dto.name,
        isSystem: false,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
      select: { id: true, code: true, name: true },
    });
  }

  async update(id: number, dto: { name?: string; permissions?: string[] }) {
    const role = await this.prisma.db.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException({ code: 'role.not_found', message: 'Роль не найдена' });
    }

    return this.prisma.transaction(async (tx) => {
      if (dto.permissions) {
        const permissionIds = await this.resolvePermissions(dto.permissions);
        // Набор прав заменяется целиком: инкрементальная правка привела бы
        // к тому, что снятое в интерфейсе право осталось бы у роли.
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          skipDuplicates: true,
        });
      }

      return tx.role.update({
        where: { id },
        data: { ...(dto.name !== undefined && { name: dto.name }) },
        select: { id: true, code: true, name: true },
      });
    });
  }

  async remove(id: number) {
    const role = await this.prisma.db.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });

    if (!role) {
      throw new NotFoundException({ code: 'role.not_found', message: 'Роль не найдена' });
    }
    if (role.isSystem) {
      throw new ConflictException({
        code: 'role.system_role',
        message: 'Системную роль удалить нельзя — можно изменить набор прав',
      });
    }
    if (role._count.users > 0) {
      throw new ConflictException({
        code: 'role.in_use',
        message: `Роль назначена пользователям: ${role._count.users}. Снимите назначения.`,
      });
    }

    return this.prisma.db.role.delete({ where: { id }, select: { id: true, code: true } });
  }

  private async resolvePermissions(codes: string[]): Promise<number[]> {
    const known = new Set<string>(ALL_PERMISSIONS as string[]);
    const unknown = codes.filter((code) => !known.has(code));
    if (unknown.length > 0) {
      throw new ConflictException({
        code: 'role.unknown_permission',
        message: 'Неизвестные права',
        details: { permissions: unknown },
      });
    }

    const rows = await this.prisma.db.permission.findMany({
      where: { code: { in: codes as Permission[] } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
