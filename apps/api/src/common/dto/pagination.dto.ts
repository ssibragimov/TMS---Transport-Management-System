import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { PaginatedResult } from '@gsm/shared';

/** Базовые параметры списочных запросов. Наследуется фильтрами конкретных модулей. */
export class PaginationDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 25;

  @ApiPropertyOptional({ description: 'Поле сортировки' })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: 'Поиск по основным полям' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }

  get take(): number {
    return this.pageSize;
  }

  /**
   * Порядок сортировки для Prisma.
   * Белый список полей обязателен: sortBy приходит от клиента,
   * и без него можно отсортировать по любому столбцу, включая password_hash.
   */
  orderBy<T extends string>(
    allowed: readonly T[],
    fallback: T,
  ): Record<string, 'asc' | 'desc'> {
    const field = allowed.includes(this.sortBy as T) ? (this.sortBy as T) : fallback;
    return { [field]: this.sortOrder };
  }
}

export function paginate<T>(
  items: T[],
  total: number,
  query: Pick<PaginationDto, 'page' | 'pageSize'>,
): PaginatedResult<T> {
  return {
    items,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}
