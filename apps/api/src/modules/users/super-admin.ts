import { Prisma } from '@prisma/client';
import { SYSTEM_ROLES } from '@gsm/shared';

import { PrismaService } from '@/common/prisma/prisma.service';
import { TenantStore } from '@/common/tenancy/tenant-context';

/**
 * Держит ли автор запроса роль суперадминистратора.
 *
 * Проверяется именно назначение роли, а не флаг bypassRls из токена: обход RLS
 * бывает и у технических учёток, а раздавать полный доступ ко всем аэропортам
 * вправе только живой суперадминистратор.
 *
 * Запрос идёт в системном контексте: назначения ролей лежат в user_roles,
 * и под обычной областью видимости актор не увидел бы даже собственных строк
 * по офисам, к которым доступа нет.
 */
export async function actorIsSuperAdmin(prisma: PrismaService): Promise<boolean> {
  const { userId } = TenantStore.require();

  // Запуск без пользователя — seed, миграция данных, фоновая задача.
  // Ограничивать их незачем: они и так работают в обход изоляции.
  if (userId === null) return true;

  return TenantStore.runAsSystem(async () => {
    const assignment = await prisma.db.userRole.findFirst({
      where: { userId, role: { code: SYSTEM_ROLES.SUPER_ADMIN } },
      select: { userId: true },
    });
    return assignment !== null;
  });
}

/**
 * Фильтр Prisma, скрывающий суперадминистраторов от всех остальных.
 *
 * Учётка суперадминистратора не должна попадаться администратору аэропорта
 * в списке: тот вправе править доступы и сбрасывать пароли, а значит через
 * чужую карточку получил бы полный доступ ко всей стране.
 */
export function hideSuperAdmins(isSuperAdmin: boolean): Prisma.UserWhereInput {
  if (isSuperAdmin) return {};
  return { roles: { none: { role: { code: SYSTEM_ROLES.SUPER_ADMIN } } } };
}
