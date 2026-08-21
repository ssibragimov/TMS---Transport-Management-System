import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  StockDocumentKind,
  StockMovementType,
  WarehouseKind,
} from '@prisma/client';
import {
  DocumentKind,
  movingAveragePrice,
  signedQuantity,
  type PaginatedResult,
} from '@gsm/shared';

import { paginate } from '@/common/dto/pagination.dto';
import { PrismaService, type PrismaTransactionClient } from '@/common/prisma/prisma.service';
import { DocumentNumberService } from '@/common/services/document-number.service';
import { TenantStore } from '@/common/tenancy/tenant-context';

import type {
  CreateStockIssueDto,
  CreateStockReceiptDto,
  CreateStockReturnDto,
  CreateStockTransferDto,
  CreateStockWriteOffDto,
  CreateStockItemDto,
  CreateWarehouseDto,
  SetMinQuantityDto,
  StockBalanceQueryDto,
  StockDocumentQueryDto,
  StockMovementQueryDto,
  TurnoverQueryDto,
  UpdateStockItemDto,
  UpdateWarehouseDto,
} from './dto/stock.dto';

/** Одна проводка по складу, ещё не записанная. Количество положительное. */
interface MovementPlan {
  warehouseId: number;
  partId: number;
  type: StockMovementType;
  quantity: number;
  unitPrice?: number | null;
  notes?: string | null;
}

/** Номер документа зависит от его вида: у каждой серии своя нумерация. */
const NUMBER_KIND: Record<StockDocumentKind, DocumentKind> = {
  RECEIPT: DocumentKind.STOCK_RECEIPT,
  ISSUE: DocumentKind.STOCK_ISSUE,
  RETURN: DocumentKind.STOCK_RETURN,
  WRITE_OFF: DocumentKind.STOCK_WRITE_OFF,
  TRANSFER: DocumentKind.STOCK_TRANSFER,
};

/** Погрешность сравнения количеств: остатки хранятся с тремя знаками. */
const EPSILON = 0.0005;

const round3 = (value: number): number => Math.round(value * 1000) / 1000;
const round2 = (value: number): number => Math.round(value * 100) / 100;

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: DocumentNumberService,
  ) {}

  // ─── Номенклатура ─────────────────────────────────────────────────────────

  /**
   * Справочник ТМЦ общий на всю страну — RLS на него не распространяется,
   * поэтому офис здесь не фильтруется. Остатки же считаются по офису и
   * подмешиваются отдельным запросом.
   */
  async listItems(officeId: number, search?: string, includeInactive = false) {
    const items = await this.prisma.db.sparePart.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
            { catalogNumber: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      take: 500,
    });

    const balances = await this.prisma.db.stockBalance.groupBy({
      by: ['partId'],
      where: { officeId, partId: { in: items.map((i) => i.id) } },
      _sum: { quantity: true },
    });
    const onHand = new Map(balances.map((b) => [b.partId, b._sum.quantity]));

    return items.map((item) => ({
      ...item,
      onHand: onHand.get(item.id) ?? new Prisma.Decimal(0),
    }));
  }

  async createItem(dto: CreateStockItemDto) {
    const existing = await this.prisma.db.sparePart.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException({
        code: 'stock.item_code_taken',
        message: `Код ${dto.code} уже занят позицией «${existing.name}»`,
      });
    }

    return this.prisma.db.sparePart.create({ data: { ...dto } });
  }

  async updateItem(id: number, dto: UpdateStockItemDto) {
    await this.requireItem(id);
    return this.prisma.db.sparePart.update({ where: { id }, data: { ...dto } });
  }

  // ─── Склады ───────────────────────────────────────────────────────────────

  async listWarehouses(officeId: number) {
    const warehouses = await this.prisma.db.warehouse.findMany({
      where: { officeId, deletedAt: null },
      orderBy: [{ kind: 'asc' }, { code: 'asc' }],
      include: { keeper: { select: { id: true, fullName: true } } },
    });

    // Итоги по каждому складу: сколько позиций и на какую сумму.
    // Без них список складов — просто перечень названий.
    const totals = await this.prisma.db.stockBalance.groupBy({
      by: ['warehouseId'],
      where: { officeId, quantity: { gt: 0 } },
      _count: { _all: true },
    });
    const positions = new Map(totals.map((t) => [t.warehouseId, t._count._all]));

    /*
     * Сырой запрос обязан идти в транзакции.
     *
     * Расширение RLS перехватывает операции моделей Prisma, но не $queryRaw:
     * тот уходит на соединение без app.office_ids, политика не пропускает
     * ни одной строки, и запрос возвращает пустой результат — без ошибки.
     * transaction() выставляет переменные сессии на своё соединение.
     */
    const value = await this.prisma.transaction((tx) =>
      tx.$queryRaw<{ warehouse_id: number; total: string | null }[]>`
        SELECT warehouse_id, SUM(quantity * COALESCE(avg_price, 0))::text AS total
        FROM stock_balances
        WHERE office_id = ${officeId}
        GROUP BY warehouse_id
      `,
    );
    const amounts = new Map(value.map((v) => [v.warehouse_id, Number(v.total ?? 0)]));

    return warehouses.map((w) => ({
      ...w,
      positions: positions.get(w.id) ?? 0,
      totalValue: amounts.get(w.id) ?? 0,
    }));
  }

  async createWarehouse(officeId: number, dto: CreateWarehouseDto) {
    const duplicate = await this.prisma.db.warehouse.findFirst({
      where: { officeId, code: dto.code, deletedAt: null },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'stock.warehouse_code_taken',
        message: `Склад с кодом ${dto.code} в этом офисе уже есть`,
      });
    }

    return this.prisma.db.warehouse.create({ data: { officeId, ...dto } });
  }

  async updateWarehouse(officeId: number, id: number, dto: UpdateWarehouseDto) {
    await this.assertWarehouseInOffice(officeId, id);
    return this.prisma.db.warehouse.update({ where: { id }, data: { ...dto } });
  }

  /** Неснижаемый запас. Заводится по паре «склад — позиция», см. DTO. */
  async setMinQuantity(officeId: number, dto: SetMinQuantityDto) {
    await this.assertWarehouseInOffice(officeId, dto.warehouseId);
    await this.requireItem(dto.partId);

    return this.prisma.db.stockBalance.upsert({
      where: {
        warehouseId_partId: { warehouseId: dto.warehouseId, partId: dto.partId },
      },
      update: { minQuantity: dto.minQuantity },
      create: {
        officeId,
        warehouseId: dto.warehouseId,
        partId: dto.partId,
        quantity: 0,
        minQuantity: dto.minQuantity,
      },
    });
  }

  // ─── Остатки, движения, документы ─────────────────────────────────────────

  async listBalances(
    officeId: number,
    query: StockBalanceQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.StockBalanceWhereInput = {
      officeId,
      ...(query.warehouseId && { warehouseId: query.warehouseId }),
      ...(query.inStockOnly && { quantity: { gt: 0 } }),
      ...((query.category || query.search) && {
        part: {
          ...(query.category && { category: query.category }),
          ...(query.search && {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }),
        },
      }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.db.stockBalance.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { part: { name: 'asc' } },
        include: {
          part: true,
          warehouse: { select: { id: true, code: true, name: true, kind: true } },
        },
      }),
      this.prisma.db.stockBalance.count({ where }),
    ]);

    /*
     * Фильтр «ниже минимума» применяется после выборки.
     *
     * Prisma не умеет сравнивать две колонки одной строки в where, а ради
     * одного фильтра переводить весь список на сырой SQL — терять типизацию
     * и include. Позиций с заданным минимумом на складе аэропорта сотни,
     * не десятки тысяч, поэтому цена такого решения — одна лишняя страница
     * в памяти.
     */
    if (query.belowMin) {
      const below = rows.filter(
        (r) => Number(r.minQuantity) > 0 && Number(r.quantity) < Number(r.minQuantity),
      );
      return paginate(below, below.length, query);
    }

    return paginate(rows, total, query);
  }

  async listMovements(
    officeId: number,
    query: StockMovementQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.StockMovementWhereInput = {
      officeId,
      ...(query.warehouseId && { warehouseId: query.warehouseId }),
      ...(query.partId && { partId: query.partId }),
      ...(query.type && { type: query.type }),
      ...((query.dateFrom || query.dateTo) && {
        movedAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.stockMovement.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ movedAt: 'desc' }, { id: 'desc' }],
        include: {
          part: { select: { id: true, code: true, name: true, unit: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          document: {
            select: {
              id: true,
              number: true,
              kind: true,
              vehicle: { select: { garageNumber: true } },
              recipientDriver: { select: { lastName: true, firstName: true } },
              recipientUser: { select: { fullName: true } },
            },
          },
        },
      }),
      this.prisma.db.stockMovement.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  async listDocuments(
    officeId: number,
    query: StockDocumentQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.StockDocumentWhereInput = {
      officeId,
      deletedAt: null,
      ...(query.kind && { kind: query.kind }),
      ...(query.warehouseId && { warehouseId: query.warehouseId }),
      ...(query.vehicleId && { vehicleId: query.vehicleId }),
      ...(query.search && { number: { contains: query.search, mode: 'insensitive' } }),
      ...((query.dateFrom || query.dateTo) && {
        documentDate: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.stockDocument.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: query.orderBy(['documentDate', 'number', 'totalAmount'], 'documentDate'),
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          targetWarehouse: { select: { id: true, code: true, name: true } },
          supplier: { select: { id: true, name: true } },
          vehicle: { select: { id: true, garageNumber: true, plateNumber: true } },
          recipientDriver: {
            select: { id: true, lastName: true, firstName: true, personnelNumber: true },
          },
          recipientUser: { select: { id: true, fullName: true } },
          _count: { select: { movements: true } },
        },
      }),
      this.prisma.db.stockDocument.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  async getDocument(officeId: number, id: number) {
    const document = await this.prisma.db.stockDocument.findFirst({
      where: { id, officeId, deletedAt: null },
      include: {
        warehouse: true,
        targetWarehouse: true,
        supplier: { select: { id: true, name: true } },
        vehicle: { select: { id: true, garageNumber: true, plateNumber: true } },
        recipientDriver: {
          select: { id: true, lastName: true, firstName: true, middleName: true, personnelNumber: true },
        },
        recipientUser: { select: { id: true, fullName: true } },
        movements: {
          orderBy: { id: 'asc' },
          include: { part: true, warehouse: { select: { code: true, name: true } } },
        },
      },
    });

    if (!document) {
      throw new NotFoundException({
        code: 'stock.document_not_found',
        message: 'Документ не найден',
      });
    }
    return document;
  }

  // ─── Проведение документов ────────────────────────────────────────────────

  /** Приход от поставщика. Увеличивает остаток и пересчитывает среднюю цену. */
  async createReceipt(officeId: number, dto: CreateStockReceiptDto) {
    return this.prisma.transaction(async (tx) => {
      const warehouse = await this.requireWarehouse(tx, officeId, dto.warehouseId);
      const parts = await this.requireParts(tx, dto.lines.map((l) => l.partId));

      const document = await this.openDocument(tx, officeId, StockDocumentKind.RECEIPT, {
        documentDate: new Date(dto.documentDate),
        warehouseId: warehouse.id,
        supplierId: dto.supplierId ?? null,
        externalNumber: dto.externalNumber ?? null,
        notes: dto.notes ?? null,
      });

      const plans: MovementPlan[] = dto.lines.map((line) => ({
        warehouseId: warehouse.id,
        partId: line.partId,
        type: StockMovementType.RECEIPT,
        quantity: line.quantity,
        unitPrice: line.unitPrice ?? null,
        notes: line.notes ?? null,
      }));

      return this.post(tx, officeId, document, plans, parts);
    });
  }

  /**
   * Выдача в эксплуатацию.
   *
   * Здесь же отрабатывается обмен «старое на новое»: если позиция помечена
   * exchangeRequired либо кладовщик отметил приём отработанного, документ
   * порождает вторую проводку — приход отработанного на склад утилизации.
   * Без неё новый аккумулятор уходит, а старый исчезает из учёта.
   */
  async createIssue(officeId: number, dto: CreateStockIssueDto) {
    if (!dto.recipientDriverId && !dto.recipientUserId) {
      throw new BadRequestException({
        code: 'stock.recipient_required',
        message: 'Укажите получателя: водителя или сотрудника',
      });
    }

    return this.prisma.transaction(async (tx) => {
      const warehouse = await this.requireWarehouse(tx, officeId, dto.warehouseId);
      const parts = await this.requireParts(tx, dto.lines.map((l) => l.partId));

      await this.assertRecipientExists(tx, officeId, dto.recipientDriverId, dto.recipientUserId);
      if (dto.vehicleId) await this.requireVehicle(tx, officeId, dto.vehicleId);

      const needsUtilization = dto.lines.some((line) => line.returnsOld);
      const utilization = needsUtilization
        ? await this.requireUtilizationWarehouse(tx, officeId)
        : null;

      /*
       * Позиции с обменом: без сданного отработанного нужна причина.
       *
       * Жёстко запрещать нельзя — бывает первая установка на новую технику
       * или утрата по акту. Но и молча выдавать нельзя: именно так с баланса
       * исчезают аккумуляторы. Поэтому либо старое на склад, либо запись
       * причины, которая останется в документе.
       */
      for (const line of dto.lines) {
        const part = parts.get(line.partId);
        if (part?.exchangeRequired && !line.returnsOld && !dto.reason?.trim()) {
          throw new ConflictException({
            code: 'stock.exchange_required',
            message:
              `«${part.name}» выдаётся в обмен на отработанное. ` +
              'Отметьте приём старого либо укажите причину выдачи без обмена.',
          });
        }
      }

      const document = await this.openDocument(tx, officeId, StockDocumentKind.ISSUE, {
        documentDate: new Date(dto.documentDate),
        warehouseId: warehouse.id,
        targetWarehouseId: utilization?.id ?? null,
        vehicleId: dto.vehicleId ?? null,
        recipientDriverId: dto.recipientDriverId ?? null,
        recipientUserId: dto.recipientUserId ?? null,
        workOrderId: dto.workOrderId ?? null,
        purpose: dto.purpose,
        reason: dto.reason ?? null,
        notes: dto.notes ?? null,
      });

      const plans: MovementPlan[] = [];
      for (const line of dto.lines) {
        plans.push({
          warehouseId: warehouse.id,
          partId: line.partId,
          type: StockMovementType.ISSUE,
          quantity: line.quantity,
          unitPrice: line.unitPrice ?? null,
          notes: line.notes ?? null,
        });

        if (line.returnsOld && utilization) {
          plans.push({
            warehouseId: utilization.id,
            partId: line.partId,
            type: StockMovementType.USED_RETURN,
            quantity: line.quantity,
            // Отработанное приходуется без цены: его стоимость определяется
            // при сдаче приёмщику, а не себестоимостью нового.
            unitPrice: null,
            notes: 'Принято при обмене',
          });
        }
      }

      return this.post(tx, officeId, document, plans, parts);
    });
  }

  /** Возврат неиспользованного на склад. */
  async createReturn(officeId: number, dto: CreateStockReturnDto) {
    return this.prisma.transaction(async (tx) => {
      const warehouse = await this.requireWarehouse(tx, officeId, dto.warehouseId);
      const parts = await this.requireParts(tx, dto.lines.map((l) => l.partId));
      await this.assertRecipientExists(tx, officeId, dto.recipientDriverId, dto.recipientUserId);

      const document = await this.openDocument(tx, officeId, StockDocumentKind.RETURN, {
        documentDate: new Date(dto.documentDate),
        warehouseId: warehouse.id,
        vehicleId: dto.vehicleId ?? null,
        recipientDriverId: dto.recipientDriverId ?? null,
        recipientUserId: dto.recipientUserId ?? null,
        notes: dto.notes ?? null,
      });

      const plans: MovementPlan[] = dto.lines.map((line) => ({
        warehouseId: warehouse.id,
        partId: line.partId,
        type: StockMovementType.RETURN,
        quantity: line.quantity,
        unitPrice: line.unitPrice ?? null,
        notes: line.notes ?? null,
      }));

      return this.post(tx, officeId, document, plans, parts);
    });
  }

  /** Списание по акту. Единственная операция, уменьшающая остаток без получателя. */
  async createWriteOff(officeId: number, dto: CreateStockWriteOffDto) {
    return this.prisma.transaction(async (tx) => {
      const warehouse = await this.requireWarehouse(tx, officeId, dto.warehouseId);
      const parts = await this.requireParts(tx, dto.lines.map((l) => l.partId));

      const document = await this.openDocument(tx, officeId, StockDocumentKind.WRITE_OFF, {
        documentDate: new Date(dto.documentDate),
        warehouseId: warehouse.id,
        vehicleId: dto.vehicleId ?? null,
        reason: dto.reason,
        notes: dto.notes ?? null,
      });

      const plans: MovementPlan[] = dto.lines.map((line) => ({
        warehouseId: warehouse.id,
        partId: line.partId,
        type: StockMovementType.WRITE_OFF,
        quantity: line.quantity,
        unitPrice: line.unitPrice ?? null,
        notes: line.notes ?? null,
      }));

      return this.post(tx, officeId, document, plans, parts);
    });
  }

  /** Перемещение между складами офиса: две проводки, один документ. */
  async createTransfer(officeId: number, dto: CreateStockTransferDto) {
    if (dto.warehouseId === dto.targetWarehouseId) {
      throw new BadRequestException({
        code: 'stock.transfer_same_warehouse',
        message: 'Склад-отправитель и склад-получатель совпадают',
      });
    }

    return this.prisma.transaction(async (tx) => {
      const from = await this.requireWarehouse(tx, officeId, dto.warehouseId);
      const to = await this.requireWarehouse(tx, officeId, dto.targetWarehouseId);
      const parts = await this.requireParts(tx, dto.lines.map((l) => l.partId));

      const document = await this.openDocument(tx, officeId, StockDocumentKind.TRANSFER, {
        documentDate: new Date(dto.documentDate),
        warehouseId: from.id,
        targetWarehouseId: to.id,
        notes: dto.notes ?? null,
      });

      const plans: MovementPlan[] = [];
      for (const line of dto.lines) {
        plans.push({
          warehouseId: from.id,
          partId: line.partId,
          type: StockMovementType.TRANSFER_OUT,
          quantity: line.quantity,
          unitPrice: line.unitPrice ?? null,
          notes: line.notes ?? null,
        });
        plans.push({
          warehouseId: to.id,
          partId: line.partId,
          type: StockMovementType.TRANSFER_IN,
          quantity: line.quantity,
          unitPrice: line.unitPrice ?? null,
          notes: line.notes ?? null,
        });
      }

      return this.post(tx, officeId, document, plans, parts);
    });
  }

  // ─── Отчёты ───────────────────────────────────────────────────────────────

  /** Плитки над списком: чем живёт склад прямо сейчас. */
  async summary(officeId: number) {
    // В транзакции — иначе политика RLS не увидит контекст офиса,
    // см. комментарий в listWarehouses.
    const [totals] = await this.prisma.transaction((tx) =>
      tx.$queryRaw<
        {
          positions: number;
          total_value: string | null;
          below_min: number;
          utilization_qty: string | null;
        }[]
      >`
        SELECT
          COUNT(*) FILTER (WHERE b.quantity > 0)::int AS positions,
          SUM(b.quantity * COALESCE(b.avg_price, 0))::text AS total_value,
          COUNT(*) FILTER (WHERE b.min_quantity > 0 AND b.quantity < b.min_quantity)::int AS below_min,
          SUM(b.quantity) FILTER (WHERE w.kind = 'UTILIZATION')::text AS utilization_qty
        FROM stock_balances b
        JOIN warehouses w ON w.id = b.warehouse_id
        WHERE b.office_id = ${officeId}
      `,
    );

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const movementsToday = await this.prisma.db.stockMovement.count({
      where: { officeId, movedAt: { gte: since } },
    });

    return {
      positions: totals?.positions ?? 0,
      totalValue: Number(totals?.total_value ?? 0),
      belowMin: totals?.below_min ?? 0,
      utilizationQuantity: Number(totals?.utilization_qty ?? 0),
      movementsToday,
    };
  }

  /**
   * Карточка складского учёта по позиции: все движения подряд с остатком
   * после каждого. Аналог бумажной карточки М-17 — то, что кладовщик
   * показывает проверяющему.
   */
  async itemCard(officeId: number, partId: number, warehouseId?: number) {
    const part = await this.requireItem(partId);

    const movements = await this.prisma.db.stockMovement.findMany({
      where: { officeId, partId, ...(warehouseId && { warehouseId }) },
      orderBy: [{ movedAt: 'desc' }, { id: 'desc' }],
      take: 200,
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        document: {
          select: {
            id: true,
            number: true,
            kind: true,
            vehicle: { select: { garageNumber: true } },
            recipientDriver: { select: { lastName: true, firstName: true } },
            recipientUser: { select: { fullName: true } },
            supplier: { select: { name: true } },
          },
        },
      },
    });

    const balances = await this.prisma.db.stockBalance.findMany({
      where: { officeId, partId, ...(warehouseId && { warehouseId }) },
      include: { warehouse: { select: { id: true, code: true, name: true, kind: true } } },
    });

    return { part, balances, movements };
  }

  /**
   * Оборотная ведомость: остаток на начало, приход, расход, остаток на конец.
   *
   * Главный отчёт кладовщика — его сдают ежемесячно. Считается из журнала
   * движений, а не из таблицы остатков: остаток знает только «сейчас»,
   * а ведомость нужна за прошлый период и обязана сходиться задним числом.
   */
  async turnover(officeId: number, query: TurnoverQueryDto) {
    const from = new Date(query.dateFrom);
    const to = new Date(query.dateTo);

    const warehouseFilter = query.warehouseId
      ? Prisma.sql`AND m.warehouse_id = ${query.warehouseId}`
      : Prisma.empty;

    // В транзакции — см. комментарий в listWarehouses.
    const rows = await this.prisma.transaction((tx) =>
      tx.$queryRaw<
        {
          part_id: number;
          code: string;
          name: string;
          unit: string;
          opening: string;
          income: string;
          outcome: string;
          closing: string;
          amount: string | null;
        }[]
      >`
      SELECT
        p.id AS part_id, p.code, p.name, p.unit,
        COALESCE(SUM(m.quantity) FILTER (WHERE m.moved_at < ${from}), 0)::text AS opening,
        COALESCE(SUM(m.quantity) FILTER (
          WHERE m.moved_at >= ${from} AND m.moved_at <= ${to} AND m.quantity > 0
        ), 0)::text AS income,
        COALESCE(SUM(-m.quantity) FILTER (
          WHERE m.moved_at >= ${from} AND m.moved_at <= ${to} AND m.quantity < 0
        ), 0)::text AS outcome,
        COALESCE(SUM(m.quantity) FILTER (WHERE m.moved_at <= ${to}), 0)::text AS closing,
        COALESCE(SUM(-m.total_amount) FILTER (
          WHERE m.moved_at >= ${from} AND m.moved_at <= ${to} AND m.quantity < 0
        ), 0)::text AS amount
      FROM stock_movements m
      JOIN spare_parts p ON p.id = m.part_id
      WHERE m.office_id = ${officeId}
        AND m.moved_at <= ${to}
        ${warehouseFilter}
      GROUP BY p.id, p.code, p.name, p.unit
      HAVING COALESCE(SUM(m.quantity) FILTER (WHERE m.moved_at <= ${to}), 0) <> 0
          OR COUNT(*) FILTER (WHERE m.moved_at >= ${from} AND m.moved_at <= ${to}) > 0
      ORDER BY p.name
    `,
    );

    return rows.map((r) => ({
      partId: r.part_id,
      code: r.code,
      name: r.name,
      unit: r.unit,
      opening: Number(r.opening),
      income: Number(r.income),
      outcome: Number(r.outcome),
      closing: Number(r.closing),
      issuedAmount: Number(r.amount ?? 0),
    }));
  }

  /**
   * Расход ТМЦ по технике за период — в штуках и в деньгах.
   *
   * Вместе с расходом топлива и наряд-заказами это даёт стоимость владения
   * единицей техники, на основании которой решают вопрос о списании машины.
   */
  async byVehicle(officeId: number, query: TurnoverQueryDto) {
    const from = new Date(query.dateFrom);
    const to = new Date(query.dateTo);

    // В транзакции — см. комментарий в listWarehouses.
    const rows = await this.prisma.transaction((tx) =>
      tx.$queryRaw<
        {
          vehicle_id: number;
          garage_number: string;
          plate_number: string | null;
          documents: number;
          amount: string | null;
        }[]
      >`
      SELECT v.id AS vehicle_id, v.garage_number, v.plate_number,
             COUNT(DISTINCT d.id)::int AS documents,
             SUM(-m.total_amount)::text AS amount
      FROM stock_movements m
      JOIN stock_documents d ON d.id = m.document_id
      JOIN vehicles v ON v.id = d.vehicle_id
      WHERE m.office_id = ${officeId}
        AND m.quantity < 0
        AND m.moved_at >= ${from} AND m.moved_at <= ${to}
      GROUP BY v.id, v.garage_number, v.plate_number
      ORDER BY SUM(-m.total_amount) DESC NULLS LAST
      LIMIT 100
    `,
    );

    return rows.map((r) => ({
      vehicleId: r.vehicle_id,
      garageNumber: r.garage_number,
      plateNumber: r.plate_number,
      documents: r.documents,
      amount: Number(r.amount ?? 0),
    }));
  }

  // ─── Внутреннее ───────────────────────────────────────────────────────────

  private async openDocument(
    tx: PrismaTransactionClient,
    officeId: number,
    kind: StockDocumentKind,
    data: Omit<Prisma.StockDocumentUncheckedCreateInput, 'officeId' | 'kind' | 'number'>,
  ) {
    const number = await this.numbers.next(
      tx,
      officeId,
      NUMBER_KIND[kind],
      data.documentDate as Date,
    );

    return tx.stockDocument.create({
      data: {
        officeId,
        kind,
        number,
        createdBy: TenantStore.get()?.userId ?? null,
        ...data,
      },
    });
  }

  /**
   * Проводит подготовленные движения и обновляет остатки.
   *
   * Вся работа идёт в транзакции документа: либо документ и все его проводки,
   * либо ничего. Половина проведённого документа хуже, чем непроведённый —
   * остаток разойдётся с журналом, и найдётся это только на инвентаризации.
   */
  private async post(
    tx: PrismaTransactionClient,
    officeId: number,
    document: { id: number; documentDate: Date; number: string },
    plans: MovementPlan[],
    parts: Map<number, { id: number; name: string; unit: string }>,
  ) {
    const userId = TenantStore.get()?.userId ?? null;
    let total = 0;

    for (const plan of plans) {
      const signed = round3(signedQuantity(plan.type, plan.quantity));
      const part = parts.get(plan.partId);

      // Строка остатка обязана существовать до блокировки: FOR UPDATE
      // не блокирует то, чего нет, и два одновременных первых прихода
      // по одной позиции разошлись бы по разным строкам.
      await tx.$executeRaw`
        INSERT INTO stock_balances (office_id, warehouse_id, part_id, quantity, min_quantity, updated_at)
        VALUES (${officeId}, ${plan.warehouseId}, ${plan.partId}, 0, 0, now())
        ON CONFLICT (warehouse_id, part_id) DO NOTHING
      `;

      const [current] = await tx.$queryRaw<{ quantity: string; avg_price: string | null }[]>`
        SELECT quantity::text, avg_price::text
        FROM stock_balances
        WHERE warehouse_id = ${plan.warehouseId} AND part_id = ${plan.partId}
        FOR UPDATE
      `;

      const before = Number(current?.quantity ?? 0);
      const after = round3(before + signed);

      if (after < -EPSILON) {
        throw new ConflictException({
          code: 'stock.insufficient',
          message:
            `«${part?.name ?? 'позиция'}»: на складе ${before} ${part?.unit ?? ''}, ` +
            `требуется ${Math.abs(signed)}`,
        });
      }

      // Средняя цена пересчитывается только приходом: расход её не меняет,
      // иначе себестоимость поехала бы от порядка выдач.
      const previousPrice = current?.avg_price === null || current?.avg_price === undefined
        ? null
        : Number(current.avg_price);
      const nextPrice =
        signed > 0 && plan.unitPrice != null
          ? round2(
              movingAveragePrice(before, previousPrice ?? plan.unitPrice, signed, plan.unitPrice),
            )
          : previousPrice;

      /*
       * Расход оценивается по средней себестоимости склада, если цену
       * не указали явно.
       *
       * Кладовщик при выдаче цену не набирает — он выдаёт литры и штуки.
       * Без этой подстановки документ выдачи остался бы без суммы, а отчёт
       * «расход ТМЦ по технике в деньгах» показывал бы нули при живом
       * движении по складу. Исключение — приём отработанного: его стоимость
       * определяется при сдаче приёмщику, а не себестоимостью нового.
       */
      const effectivePrice =
        plan.unitPrice ??
        (signed < 0 || plan.type === StockMovementType.TRANSFER_IN ? previousPrice : null);

      await tx.$executeRaw`
        UPDATE stock_balances
        SET quantity = ${after}, avg_price = ${nextPrice}, updated_at = now()
        WHERE warehouse_id = ${plan.warehouseId} AND part_id = ${plan.partId}
      `;

      const amount =
        effectivePrice == null ? null : round2(signed * effectivePrice);

      await tx.stockMovement.create({
        data: {
          officeId,
          documentId: document.id,
          warehouseId: plan.warehouseId,
          partId: plan.partId,
          type: plan.type,
          quantity: signed,
          unitPrice: effectivePrice,
          totalAmount: amount,
          balanceAfter: after,
          movedAt: document.documentDate,
          notes: plan.notes ?? null,
          createdBy: userId,
        },
      });

      if (amount != null) total += Math.abs(amount);
    }

    // Сумма документа — по основным проводкам; приём отработанного цены
    // не имеет и в сумму не попадает (см. комментарий в createIssue).
    // Перемещение считается по одной стороне: иначе сумма удвоится.
    const divisor = plans.some((p) => p.type === StockMovementType.TRANSFER_IN) ? 2 : 1;

    return tx.stockDocument.update({
      where: { id: document.id },
      data: { totalAmount: total > 0 ? round2(total / divisor) : null },
      include: {
        movements: { include: { part: { select: { code: true, name: true, unit: true } } } },
        warehouse: { select: { code: true, name: true } },
      },
    });
  }

  private async requireWarehouse(
    tx: PrismaTransactionClient,
    officeId: number,
    id: number,
  ) {
    const warehouse = await tx.warehouse.findFirst({
      where: { id, officeId, deletedAt: null, isActive: true },
      select: { id: true, code: true, name: true, kind: true },
    });

    if (!warehouse) {
      throw new NotFoundException({
        code: 'stock.warehouse_not_found',
        message: 'Склад не найден или закрыт',
      });
    }
    return warehouse;
  }

  /** Тот же контроль, что requireWarehouse, но вне транзакции документа. */
  private async assertWarehouseInOffice(officeId: number, id: number): Promise<void> {
    const warehouse = await this.prisma.db.warehouse.findFirst({
      where: { id, officeId, deletedAt: null },
      select: { id: true },
    });
    if (!warehouse) {
      throw new NotFoundException({
        code: 'stock.warehouse_not_found',
        message: 'Склад не найден',
      });
    }
  }

  private async requireUtilizationWarehouse(tx: PrismaTransactionClient, officeId: number) {
    const warehouse = await tx.warehouse.findFirst({
      where: {
        officeId,
        kind: WarehouseKind.UTILIZATION,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, code: true, name: true, kind: true },
    });

    if (!warehouse) {
      throw new BadRequestException({
        code: 'stock.no_utilization_warehouse',
        message:
          'В офисе нет склада отработанных материалов. Заведите его, ' +
          'чтобы принимать старые аккумуляторы и шины при обмене.',
      });
    }
    return warehouse;
  }

  private async requireParts(tx: PrismaTransactionClient, ids: number[]) {
    const unique = [...new Set(ids)];
    const parts = await tx.sparePart.findMany({
      where: { id: { in: unique }, isActive: true },
      select: {
        id: true,
        name: true,
        unit: true,
        exchangeRequired: true,
      },
    });

    if (parts.length !== unique.length) {
      const found = new Set(parts.map((p) => p.id));
      const missing = unique.filter((id) => !found.has(id));
      throw new NotFoundException({
        code: 'stock.item_not_found',
        message: `Позиция номенклатуры не найдена или снята с учёта: ${missing.join(', ')}`,
      });
    }

    return new Map(parts.map((p) => [p.id, p]));
  }

  private async requireItem(id: number) {
    const item = await this.prisma.db.sparePart.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException({
        code: 'stock.item_not_found',
        message: 'Позиция номенклатуры не найдена',
      });
    }
    return item;
  }

  private async requireVehicle(tx: PrismaTransactionClient, officeId: number, id: number) {
    const vehicle = await tx.vehicle.findFirst({
      where: { id, officeId, deletedAt: null },
      select: { id: true, garageNumber: true },
    });
    if (!vehicle) {
      throw new NotFoundException({
        code: 'stock.vehicle_not_found',
        message: 'Техника не найдена в этом офисе',
      });
    }
    return vehicle;
  }

  private async assertRecipientExists(
    tx: PrismaTransactionClient,
    officeId: number,
    driverId?: number,
    userId?: number,
  ): Promise<void> {
    if (driverId) {
      const driver = await tx.driver.findFirst({
        where: { id: driverId, officeId, deletedAt: null },
        select: { id: true },
      });
      if (!driver) {
        throw new NotFoundException({
          code: 'stock.recipient_not_found',
          message: 'Водитель-получатель не найден в этом офисе',
        });
      }
    }

    if (userId) {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true },
      });
      if (!user) {
        throw new NotFoundException({
          code: 'stock.recipient_not_found',
          message: 'Сотрудник-получатель не найден',
        });
      }
    }
  }
}
