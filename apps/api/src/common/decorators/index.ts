import {
  SetMetadata,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Permission, JwtAccessPayload } from '@gsm/shared';

/** Маршрут доступен без аутентификации (логин, health-check). */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Требуемые права. Проверяются PermissionsGuard; при нескольких правах
 * достаточно любого из них — комбинации «и» в этой системе не встречаются.
 */
export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Полезная нагрузка токена текущего пользователя. */
export const CurrentUser = createParamDecorator(
  (field: keyof JwtAccessPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtAccessPayload }>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);

/**
 * Активный офис из токена.
 * Сервисы обязаны проставлять его во все создаваемые записи: RLS не даст
 * записать чужой office_id, но осмысленную ошибку лучше получить раньше.
 */
export const CurrentOffice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtAccessPayload }>();
    return request.user?.officeId ?? 0;
  },
);
