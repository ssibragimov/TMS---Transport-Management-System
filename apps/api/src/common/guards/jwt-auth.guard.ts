import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { JwtAccessPayload } from '@gsm/shared';

import { IS_PUBLIC_KEY } from '@/common/decorators';
import { TenantStore } from '@/common/tenancy/tenant-context';

/**
 * Аутентификация + наполнение контекста арендатора.
 *
 * Guard подключён глобально, поэтому по умолчанию закрыт каждый маршрут —
 * забыть повесить защиту на новый контроллер нельзя. Открывается явно
 * декоратором @Public().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    return super.canActivate(context);
  }

  // Сигнатура обобщённая, потому что таковой её объявляет IAuthGuard.
  // Фактически сюда всегда приходит результат JwtStrategy.validate().
  handleRequest<TUser = JwtAccessPayload>(
    err: Error | null,
    user: TUser | false,
    info: { message?: string } | undefined,
  ): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException(info?.message ?? 'Требуется авторизация');
    }

    const payload = user as unknown as JwtAccessPayload;

    // Ровно эти значения уйдут в переменные сессии PostgreSQL для RLS.
    TenantStore.hydrate({
      userId: payload.sub,
      officeId: payload.officeId,
      officeScope: payload.officeScope,
      bypassRls: payload.bypassRls,
    });

    return user;
  }
}
