import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditAction } from '@prisma/client';
import type { Request } from 'express';
import { Observable, from, switchMap, tap } from 'rxjs';

import { PrismaService } from '@/common/prisma/prisma.service';
import { TenantStore } from '@/common/tenancy/tenant-context';

export const AUDIT_KEY = 'auditEntity';
export const AUDIT_ACTION_KEY = 'auditAction';
export const AUDIT_MODEL_KEY = 'auditModel';

/**
 * Сущности, состояние которых можно прочитать до изменения.
 *
 * Ключ — имя из @Audited, значение — делегат Prisma. Только для них
 * журнал сможет показать «было → стало»; для составных операций
 * (например, выдача ГСМ трогает и документ, и остаток ёмкости)
 * снимок «до» по одной таблице был бы обманчив, поэтому их здесь нет.
 */
const AUDITABLE_MODELS = {
  Vehicle: 'vehicle',
  Driver: 'driver',
  Waybill: 'waybill',
  User: 'user',
  Role: 'role',
  FuelType: 'fuelType',
  VehicleModel: 'vehicleModel',
  Department: 'department',
  Counterparty: 'counterparty',
  SparePart: 'sparePart',
  Office: 'office',
} as const;

type AuditableEntity = keyof typeof AUDITABLE_MODELS;

/**
 * Помечает контроллер или обработчик как подлежащий аудиту.
 *
 * На обработчике перекрывает значение с контроллера — это нужно для
 * вложенных ресурсов. Без переопределения удаление фотографии попадало бы
 * в журнал как «DELETE Vehicle», то есть выглядело бы как списание техники.
 *
 * @example
 * @Audited('Vehicle')          // на контроллере
 * @Controller('vehicles')
 *
 * @Audited('VehiclePhoto')     // на обработчике вложенного ресурса
 * @Delete(':id/photos/:photoId')
 */
export const Audited = (entity: string) => SetMetadata(AUDIT_KEY, entity);

/** Переопределяет действие там, где HTTP-метод не отражает смысл операции. */
export const AuditAs = (action: AuditAction) => SetMetadata(AUDIT_ACTION_KEY, action);

const ACTION_BY_METHOD: Record<string, AuditAction> = {
  POST: AuditAction.CREATE,
  PUT: AuditAction.UPDATE,
  PATCH: AuditAction.UPDATE,
  DELETE: AuditAction.DELETE,
};

const SENSITIVE_FIELDS = [
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'refreshToken',
  'accessToken',
];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const entity = this.reflector.getAllAndOverride<string>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();

    const override = this.reflector.get<AuditAction>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );
    const action = override ?? ACTION_BY_METHOD[request.method];

    if (!entity || !action) return next.handle();

    const entityId = request.params?.id;
    const capturesBefore =
      entityId !== undefined &&
      (action === AuditAction.UPDATE ||
        action === AuditAction.DELETE ||
        action === AuditAction.APPROVE ||
        action === AuditAction.REJECT);

    // Снимок «до» читается ДО выполнения обработчика — после изменения
    // прежнее состояние уже не восстановить.
    const before$ = capturesBefore
      ? from(this.snapshot(entity, Number(entityId)))
      : from(Promise.resolve(null));

    return before$.pipe(
      switchMap((before) =>
        next.handle().pipe(
          tap((result) => {
            void this.write(entity, action, request, result, before);
          }),
        ),
      ),
    );
  }

  /** Текущее состояние записи или null, если сущность не поддерживает снимок. */
  private async snapshot(
    entity: string,
    id: number,
  ): Promise<Record<string, unknown> | null> {
    const modelKey = AUDITABLE_MODELS[entity as AuditableEntity];
    if (!modelKey || Number.isNaN(id)) return null;

    try {
      const delegate = (
        this.prisma.db as unknown as Record<
          string,
          { findUnique: (args: unknown) => Promise<Record<string, unknown> | null> }
        >
      )[modelKey];
      if (!delegate?.findUnique) return null;

      const record = await delegate.findUnique({ where: { id } });
      return record ? (this.sanitize(record) ?? null) : null;
    } catch (error) {
      this.logger.warn(
        `Снимок «до» для ${entity}#${id} не получен: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async write(
    entity: string,
    action: AuditAction,
    request: Request,
    result: unknown,
    before: Record<string, unknown> | null,
  ): Promise<void> {
    const context = TenantStore.get();
    if (!context) return;

    const entityId =
      this.extractId(result) ?? (request.params?.id as string | undefined) ?? null;

    // Для изменений сохраняем только реально изменившиеся поля: полный
    // снимок сущности на каждую правку раздувает журнал и прячет суть.
    const after =
      action === AuditAction.DELETE
        ? null
        : (this.sanitize(request.body as object) ?? null);
    const diff = before && after ? this.changedFields(before, after) : null;

    try {
      await this.prisma.db.auditLog.create({
        data: {
          officeId: context.officeId || null,
          userId: context.userId,
          action,
          entity,
          entityId: entityId ? String(entityId) : null,
          before: diff ? diff.before : (before ?? undefined),
          after: diff ? diff.after : (after ?? undefined),
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent?.slice(0, 400) ?? null,
          requestId: context.requestId,
        },
      });
    } catch (error) {
      // Сбой аудита не должен ронять успешную бизнес-операцию,
      // но обязан быть виден в логах.
      this.logger.error(
        `Не удалось записать аудит ${entity}.${action}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Оставляет только поля, которые действительно изменились.
   * Сравнение по JSON: значения из Prisma (Decimal, Date) иначе никогда
   * не совпадут с примитивами из тела запроса.
   */
  private changedFields(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
    const changedBefore: Record<string, unknown> = {};
    const changedAfter: Record<string, unknown> = {};
    let count = 0;

    for (const [key, nextValue] of Object.entries(after)) {
      if (!(key in before)) {
        changedAfter[key] = nextValue;
        count += 1;
        continue;
      }
      const prevValue = before[key];
      if (JSON.stringify(prevValue) !== JSON.stringify(nextValue)) {
        changedBefore[key] = prevValue;
        changedAfter[key] = nextValue;
        count += 1;
      }
    }

    return count > 0 ? { before: changedBefore, after: changedAfter } : null;
  }

  private extractId(result: unknown): string | number | null {
    if (result && typeof result === 'object' && 'id' in result) {
      const id = (result as { id: unknown }).id;
      if (typeof id === 'string' || typeof id === 'number') return id;
    }
    return null;
  }

  /** Пароли и токены в журнал не попадают ни в каком виде. */
  private sanitize(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object') return undefined;

    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      copy[key] = SENSITIVE_FIELDS.includes(key) ? '***' : item;
    }
    return copy;
  }
}
