import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentKind, formatDocumentNumber } from '@gsm/shared';

import type { PrismaTransactionClient } from '@/common/prisma/prisma.service';

/**
 * Выдача номеров документов.
 *
 * Требование к нумерации путевых листов: последовательность без пропусков
 * в пределах офиса и года. Sequence PostgreSQL не подходит — он теряет номера
 * при откате транзакции, а пропущенный номер в журнале путевых листов
 * приходится объяснять проверяющему.
 *
 * Поэтому счётчик — обычная строка таблицы, блокируемая FOR UPDATE.
 * Вызов обязан выполняться внутри той же транзакции, что и вставка документа:
 * тогда откат вставки откатывает и номер.
 */
@Injectable()
export class DocumentNumberService {
  /**
   * @example
   * await prisma.transaction(async (tx) => {
   *   const number = await this.numbers.next(tx, officeId, DocumentKind.WAYBILL, new Date());
   *   return tx.waybill.create({ data: { number, ... } });
   * });
   */
  async next(
    tx: PrismaTransactionClient,
    officeId: number,
    kind: DocumentKind,
    onDate: Date = new Date(),
  ): Promise<string> {
    const year = onDate.getFullYear();

    const office = await tx.office.findUnique({
      where: { id: officeId },
      select: { code: true },
    });
    if (!office) {
      throw new NotFoundException({
        code: 'office.not_found',
        message: `Офис ${officeId} не найден`,
      });
    }

    // Атомарный инкремент. ON CONFLICT покрывает первый документ года,
    // RETURNING отдаёт уже увеличенное значение — гонка двух диспетчеров,
    // выдающих путевые листы одновременно, исключена на уровне СУБД.
    const rows = await tx.$queryRaw<{ last_value: number }[]>`
      INSERT INTO document_sequences (office_id, kind, year, last_value, updated_at)
      VALUES (${officeId}, ${kind}, ${year}, 1, now())
      ON CONFLICT (office_id, kind, year)
      DO UPDATE SET last_value = document_sequences.last_value + 1,
                    updated_at = now()
      RETURNING last_value
    `;

    return formatDocumentNumber({
      kind,
      officeCode: office.code,
      year,
      sequence: rows[0].last_value,
    });
  }

  /** Текущее значение счётчика — для отображения «следующий номер» в форме. */
  async peek(
    tx: PrismaTransactionClient,
    officeId: number,
    kind: DocumentKind,
    onDate: Date = new Date(),
  ): Promise<number> {
    const row = await tx.documentSequence.findUnique({
      where: {
        officeId_kind_year: { officeId, kind, year: onDate.getFullYear() },
      },
      select: { lastValue: true },
    });
    return (row?.lastValue ?? 0) + 1;
  }
}
