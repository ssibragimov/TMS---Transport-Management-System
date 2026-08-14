import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtAccessPayload, Permission } from '@gsm/shared';

import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '@/common/decorators';

/**
 * Проверка прав из токена.
 *
 * Права зашиты в access-токен, поэтому проверка не ходит в БД на каждый запрос.
 * Плата за это — отзыв роли вступает в силу не мгновенно, а при следующем
 * обновлении токена (до 15 минут). Немедленный отзыв делается инкрементом
 * users.session_version: он ломает refresh, и сессия обрывается на первом же
 * продлении. Если понадобится отзыв в ту же секунду, сюда добавится проверка
 * session_version через Redis-кэш.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtAccessPayload }>();
    const granted = request.user?.permissions ?? [];

    if (required.some((permission) => granted.includes(permission))) return true;

    throw new ForbiddenException({
      code: 'auth.permission_denied',
      message: 'Недостаточно прав для выполнения операции',
      details: { required },
    });
  }
}
