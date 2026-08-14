import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ApiErrorResponse } from '@gsm/shared';

import { TenantStore } from '@/common/tenancy/tenant-context';

/**
 * Единый формат ошибки для всего API.
 *
 * `code` — машинный ключ: клиент переводит его на язык пользователя, а не
 * показывает серверный текст. Тексты на русском здесь — запасной вариант
 * для отладки и логов.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = TenantStore.get()?.requestId ?? 'unknown';

    const { status, code, message, details } = this.normalize(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${requestId}] ${request.method} ${request.url} → ${status} ${code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`[${requestId}] ${request.method} ${request.url} → ${status} ${code}`);
    }

    const body: ApiErrorResponse = {
      statusCode: status,
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    };

    response.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: Record<string, string[]>;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'object' && payload !== null) {
        const p = payload as Record<string, unknown>;

        // Ошибки ValidationPipe: message — массив строк
        if (Array.isArray(p.message)) {
          return {
            status,
            code: 'validation.failed',
            message: 'Проверьте правильность заполнения полей',
            details: { _: p.message as string[] },
          };
        }

        return {
          status,
          code: (p.code as string) ?? this.codeFromStatus(status),
          message: (p.message as string) ?? exception.message,
          details: p.details as Record<string, string[]> | undefined,
        };
      }

      return { status, code: this.codeFromStatus(status), message: exception.message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'internal.error',
      message: 'Внутренняя ошибка сервера',
    };
  }

  private fromPrisma(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    code: string;
    message: string;
    details?: Record<string, string[]>;
  } {
    const target = (error.meta?.target as string[] | undefined) ?? [];

    switch (error.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: 'db.unique_violation',
          message: 'Запись с такими значениями уже существует',
          details: target.length ? { fields: target } : undefined,
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          code: 'db.foreign_key_violation',
          message: 'Связанная запись не найдена или используется',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'db.not_found',
          message: 'Запись не найдена',
        };
      // Нарушение политики RLS выглядит как отказ в записи: попытка создать
      // или изменить строку в чужом офисе.
      case 'P2010':
        return {
          status: HttpStatus.FORBIDDEN,
          code: 'db.row_level_security',
          message: 'Операция запрещена политикой доступа к данным офиса',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: `db.${error.code.toLowerCase()}`,
          message: 'Ошибка обращения к базе данных',
        };
    }
  }

  private codeFromStatus(status: number): string {
    const map: Record<number, string> = {
      400: 'request.bad',
      401: 'auth.unauthorized',
      403: 'auth.forbidden',
      404: 'resource.not_found',
      409: 'resource.conflict',
      422: 'validation.failed',
      429: 'request.throttled',
    };
    return map[status] ?? 'internal.error';
  }
}
