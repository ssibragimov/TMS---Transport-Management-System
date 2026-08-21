import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { PERMISSIONS, type PaginatedResult } from '@gsm/shared';

import { CurrentOffice, RequirePermissions } from '@/common/decorators';
import { PaginationDto, paginate } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { TenantStore } from '@/common/tenancy/tenant-context';

class AuditQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  /**
   * Всё, что относится к одной записи, включая операции над её вложенными
   * объектами. Задаётся парой: relatedEntity=Vehicle&relatedId=12.
   */
  @IsOptional()
  @IsString()
  relatedEntity?: string;

  @IsOptional()
  @IsString()
  relatedId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  userId?: number;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

/**
 * Журнал действий.
 *
 * Только чтение — записи создаёт перехватчик, изменять и удалять их нельзя
 * ни через API, ни через интерфейс. Журнал, который можно подчистить,
 * бесполезен при разборе.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(officeId: number, query: AuditQueryDto): Promise<PaginatedResult<unknown>> {
    const context = TenantStore.require();

    const where: Prisma.AuditLogWhereInput = {
      // Записи входа в систему происходят до выбора офиса и не привязаны
      // ни к одному из них. Их видит только тот, кто смотрит журнал
      // с обходом изоляции — иначе они утекали бы во все офисы сразу.
      ...(context.bypassRls ? {} : { officeId }),
      ...(query.action && { action: query.action }),
      ...(query.entity && { entity: query.entity }),
      ...(query.entityId && { entityId: query.entityId }),
      ...(query.userId && { userId: query.userId }),
      // Карточка сущности: сама запись плюс всё вложенное в неё.
      // Без второй половины условия загрузка фотографии или правка документа
      // техники в её собственном журнале не появились бы.
      ...(query.relatedEntity &&
        query.relatedId && {
          OR: [
            { entity: query.relatedEntity, entityId: query.relatedId },
            { parentEntity: query.relatedEntity, parentId: query.relatedId },
          ],
        }),
      ...((query.dateFrom || query.dateTo) && {
        createdAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: this.endOfDay(query.dateTo) }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.auditLog.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          parentEntity: true,
          parentId: true,
          before: true,
          after: true,
          ipAddress: true,
          requestId: true,
          createdAt: true,
          officeId: true,
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.db.auditLog.count({ where }),
    ]);

    // BigInt из Postgres не сериализуется в JSON — приводим к строке.
    const serialised = items.map((item) => ({ ...item, id: String(item.id) }));

    return paginate(serialised, total, query);
  }

  /** Перечень сущностей, встречающихся в журнале, — для фильтра в интерфейсе. */
  async entities(officeId: number) {
    const context = TenantStore.require();

    const rows = await this.prisma.db.auditLog.groupBy({
      by: ['entity'],
      where: context.bypassRls ? {} : { officeId },
      _count: { _all: true },
      orderBy: { _count: { entity: 'desc' } },
    });

    return rows.map((row) => ({ entity: row.entity, count: row._count._all }));
  }

  private endOfDay(value: string): Date {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
  }
}

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({
    summary: 'Журнал действий пользователей',
    description:
      'Только чтение. Для изменений сохраняются лишь изменившиеся поля — ' +
      'полный снимок сущности на каждую правку прятал бы суть.',
  })
  list(@CurrentOffice() officeId: number, @Query() query: AuditQueryDto) {
    return this.audit.list(officeId, query);
  }

  @Get('entities')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'Сущности, встречающиеся в журнале' })
  entities(@CurrentOffice() officeId: number) {
    return this.audit.entities(officeId);
  }
}

@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
