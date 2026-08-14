import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { TenantStore, type TenantContext } from './tenant-context';

/**
 * Создаёт контекст запроса.
 *
 * Именно middleware, а не interceptor: AsyncLocalStorage.run должен обернуть
 * весь конвейер (guard'ы, pipe'ы, обработчик, interceptor'ы), а interceptor
 * запускается позже и его контекст теряется при подписке на Observable.
 *
 * На этом этапе пользователь ещё неизвестен — контекст заполняется нулевыми
 * значениями, а JwtAuthGuard дописывает в него данные из токена.
 * Пустой officeScope означает «не видно ничего»: политики RLS по умолчанию
 * закрыты, и незаполненный контекст не открывает данные, а закрывает их.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

    const context: TenantContext = {
      officeId: 0,
      officeScope: [],
      bypassRls: false,
      userId: null,
      requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    res.setHeader('x-request-id', requestId);

    TenantStore.run(context, () => next());
  }
}
