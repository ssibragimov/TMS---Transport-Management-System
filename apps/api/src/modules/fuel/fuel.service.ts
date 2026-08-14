import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertSeverity,
  AlertType,
  FuelSource,
  MeterSource,
  Prisma,
} from '@prisma/client';
import { DocumentKind, type PaginatedResult } from '@gsm/shared';

import { paginate } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { DocumentNumberService } from '@/common/services/document-number.service';
import { TenantStore } from '@/common/tenancy/tenant-context';

import type {
  CreateFuelIssueDto,
  CreateFuelReceiptDto,
  FuelIssueQueryDto,
} from './dto/fuel.dto';

/**
 * Две заправки, разнесённые географически, но близкие по времени, физически
 * невозможны. Порог подобран под расстояния внутри одного аэропорта.
 */
const IMPOSSIBLE_SEQUENCE_MINUTES = 20;

@Injectable()
export class FuelService {
  private readonly logger = new Logger(FuelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: DocumentNumberService,
  ) {}

  // ─── Приход ───────────────────────────────────────────────────────────────

  /**
   * Оприходование топлива в ёмкость.
   *
   * Приход и увеличение остатка ёмкости — одна транзакция. Иначе при сбое
   * между двумя запросами книжный остаток разойдётся с документами,
   * и найдут это только на инвентаризации через месяц.
   */
  async createReceipt(officeId: number, dto: CreateFuelReceiptDto) {
    const userId = TenantStore.get()?.userId ?? null;

    return this.prisma.transaction(async (tx) => {
      const tank = await tx.fuelTank.findFirst({
        where: { id: dto.tankId, officeId, deletedAt: null },
      });
      if (!tank) {
        throw new NotFoundException({
          code: 'fuel.tank_not_found',
          message: 'Ёмкость не найдена',
        });
      }

      const newVolume = Number(tank.currentVolume) + dto.volume;
      if (newVolume > Number(tank.capacity)) {
        throw new BadRequestException({
          code: 'fuel.tank_capacity_exceeded',
          message:
            `Не помещается: ёмкость ${tank.capacity} л, остаток ${tank.currentVolume} л, ` +
            `приход ${dto.volume} л`,
        });
      }

      const documentNumber = await this.numbers.next(
        tx,
        officeId,
        DocumentKind.FUEL_RECEIPT,
        new Date(dto.receivedAt),
      );

      const receipt = await tx.fuelReceipt.create({
        data: {
          officeId,
          tankId: tank.id,
          fuelTypeId: tank.fuelTypeId,
          supplierId: dto.supplierId ?? null,
          documentNumber,
          externalNumber: dto.externalNumber ?? null,
          receivedAt: new Date(dto.receivedAt),
          volume: dto.volume,
          density: dto.density ?? null,
          pricePerLitre: dto.pricePerLitre ?? null,
          totalAmount: dto.pricePerLitre ? dto.pricePerLitre * dto.volume : null,
          fileKey: dto.fileKey ?? null,
          notes: dto.notes ?? null,
          createdBy: userId,
        },
      });

      await tx.fuelTank.update({
        where: { id: tank.id },
        data: { currentVolume: { increment: dto.volume } },
      });

      return receipt;
    });
  }

  async listReceipts(
    officeId: number,
    query: FuelIssueQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.FuelReceiptWhereInput = {
      officeId,
      deletedAt: null,
      ...(query.tankId && { tankId: query.tankId }),
      ...((query.dateFrom || query.dateTo) && {
        receivedAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.fuelReceipt.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: query.orderBy(['receivedAt', 'volume', 'createdAt'], 'receivedAt'),
        include: {
          tank: { select: { id: true, code: true, name: true } },
          supplier: { select: { id: true, name: true } },
          fuelType: { select: { code: true, name: true } },
        },
      }),
      this.prisma.db.fuelReceipt.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  async listInventories(officeId: number, query: FuelIssueQueryDto) {
    const where: Prisma.FuelInventoryWhereInput = {
      officeId,
      deletedAt: null,
      ...(query.tankId && { tankId: query.tankId }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.fuelInventory.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { countedAt: 'desc' },
        include: { tank: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.db.fuelInventory.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  // ─── Выдача ───────────────────────────────────────────────────────────────

  async listIssues(
    officeId: number,
    query: FuelIssueQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.FuelIssueWhereInput = {
      officeId,
      deletedAt: null,
      ...(query.vehicleId && { vehicleId: query.vehicleId }),
      ...(query.tankId && { tankId: query.tankId }),
      ...(query.source && { source: query.source }),
      ...((query.dateFrom || query.dateTo) && {
        issuedAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.fuelIssue.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: query.orderBy(['issuedAt', 'volume', 'createdAt'], 'issuedAt'),
        include: {
          vehicle: { select: { id: true, garageNumber: true, plateNumber: true } },
          driver: { select: { id: true, lastName: true, firstName: true } },
          tank: { select: { id: true, code: true, name: true } },
          waybill: { select: { id: true, number: true } },
        },
      }),
      this.prisma.db.fuelIssue.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  /**
   * Выдача топлива в бак техники.
   *
   * В одной транзакции: документ выдачи, списание с ёмкости, обновление
   * остатка в баке, запись показаний счётчика и, при необходимости,
   * начисление объёма в открытый путевой лист.
   */
  async createIssue(officeId: number, dto: CreateFuelIssueDto) {
    const userId = TenantStore.get()?.userId ?? null;
    const issuedAt = new Date(dto.issuedAt);

    const result = await this.prisma.transaction(async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: dto.vehicleId, officeId, deletedAt: null },
      });
      if (!vehicle) {
        throw new NotFoundException({
          code: 'vehicle.not_found',
          message: 'Единица техники не найдена',
        });
      }

      // Заправить больше, чем вмещает бак, невозможно физически.
      // Чаще всего это опечатка в объёме — ловим на вводе, а не на отчёте.
      if (vehicle.tankCapacity) {
        const afterFill = Number(vehicle.currentFuelLevel) + dto.volume;
        if (afterFill > Number(vehicle.tankCapacity) * 1.05) {
          throw new BadRequestException({
            code: 'fuel.vehicle_tank_overflow',
            message:
              `Объём превышает вместимость бака: бак ${vehicle.tankCapacity} л, ` +
              `в баке ${vehicle.currentFuelLevel} л, заправка ${dto.volume} л`,
          });
        }
      }

      let fuelTypeId = vehicle.fuelTypeId;

      if (dto.source === FuelSource.TANK) {
        const tank = await tx.fuelTank.findFirst({
          where: { id: dto.tankId, officeId, deletedAt: null },
        });
        if (!tank) {
          throw new NotFoundException({
            code: 'fuel.tank_not_found',
            message: 'Ёмкость не найдена',
          });
        }
        if (Number(tank.currentVolume) < dto.volume) {
          throw new BadRequestException({
            code: 'fuel.insufficient_tank_volume',
            message: `В ёмкости недостаточно топлива: остаток ${tank.currentVolume} л`,
          });
        }

        // Вид топлива берётся у ёмкости: залить дизель в бензиновый
        // автобус нельзя, и документ об этом создаваться не должен.
        if (vehicle.fuelTypeId && vehicle.fuelTypeId !== tank.fuelTypeId) {
          throw new BadRequestException({
            code: 'fuel.type_mismatch',
            message: 'Вид топлива в ёмкости не совпадает с видом топлива техники',
          });
        }
        fuelTypeId = tank.fuelTypeId;

        await tx.fuelTank.update({
          where: { id: tank.id },
          data: { currentVolume: { decrement: dto.volume } },
        });
      }

      if (!fuelTypeId) {
        throw new BadRequestException({
          code: 'fuel.type_unknown',
          message: 'Не определён вид топлива: укажите его в карточке техники',
        });
      }

      const documentNumber = await this.numbers.next(
        tx,
        officeId,
        DocumentKind.FUEL_ISSUE,
        issuedAt,
      );

      const issue = await tx.fuelIssue.create({
        data: {
          officeId,
          vehicleId: vehicle.id,
          driverId: dto.driverId ?? null,
          waybillId: dto.waybillId ?? null,
          fuelTypeId,
          source: dto.source,
          tankId: dto.source === FuelSource.TANK ? dto.tankId! : null,
          fuelCardId: dto.source === FuelSource.FUEL_CARD ? dto.fuelCardId! : null,
          documentNumber,
          issuedAt,
          volume: dto.volume,
          pricePerLitre: dto.pricePerLitre ?? null,
          totalAmount: dto.pricePerLitre ? dto.pricePerLitre * dto.volume : null,
          odometerAtIssue: dto.odometerAtIssue ?? null,
          engineHoursAtIssue: dto.engineHoursAtIssue ?? null,
          locationName: dto.locationName ?? null,
          operatorId: userId,
          notes: dto.notes ?? null,
          createdBy: userId,
        },
      });

      await tx.vehicle.update({
        where: { id: vehicle.id },
        data: {
          currentFuelLevel: { increment: dto.volume },
          ...(dto.odometerAtIssue !== undefined && { currentOdometer: dto.odometerAtIssue }),
          ...(dto.engineHoursAtIssue !== undefined && {
            currentEngineHours: dto.engineHoursAtIssue,
          }),
        },
      });

      if (dto.odometerAtIssue !== undefined || dto.engineHoursAtIssue !== undefined) {
        await tx.vehicleMeterReading.create({
          data: {
            vehicleId: vehicle.id,
            recordedAt: issuedAt,
            odometer: dto.odometerAtIssue ?? null,
            engineHours: dto.engineHoursAtIssue ?? null,
            source: MeterSource.MANUAL,
            comment: `Заправка ${documentNumber}`,
            createdBy: userId,
          },
        });
      }

      // Выданное за смену топливо сразу отражается в путевом листе:
      // при закрытии диспетчеру не придётся складывать заправки руками.
      if (dto.waybillId) {
        await tx.waybill.updateMany({
          where: { id: dto.waybillId, officeId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
          data: { fuelIssued: { increment: dto.volume } },
        });
      }

      return issue;
    });

    // Проверки на аномалии выполняются после фиксации транзакции:
    // подозрительная заправка — повод для разбирательства, а не для отказа.
    void this.detectAnomalies(officeId, result.id, dto.vehicleId, issuedAt);

    return result;
  }

  // ─── Ёмкости ──────────────────────────────────────────────────────────────

  listTanks(officeId: number) {
    return this.prisma.db.fuelTank.findMany({
      where: { officeId, deletedAt: null },
      orderBy: { code: 'asc' },
      include: { fuelType: { select: { id: true, code: true, name: true } } },
    });
  }

  /**
   * Инвентаризация: сверка книжного остатка с фактическим замером.
   * Расхождение сверх порога поднимает алерт — это основной способ
   * обнаружить недостачу.
   */
  async createInventory(
    officeId: number,
    dto: { tankId: number; countedAt: string; actualVolume: number; commission?: string; notes?: string },
  ) {
    const userId = TenantStore.get()?.userId ?? null;

    return this.prisma.transaction(async (tx) => {
      const tank = await tx.fuelTank.findFirst({
        where: { id: dto.tankId, officeId, deletedAt: null },
      });
      if (!tank) {
        throw new NotFoundException({
          code: 'fuel.tank_not_found',
          message: 'Ёмкость не найдена',
        });
      }

      const bookVolume = Number(tank.currentVolume);
      const difference = dto.actualVolume - bookVolume;

      const documentNumber = await this.numbers.next(
        tx,
        officeId,
        DocumentKind.INVENTORY_ACT,
        new Date(dto.countedAt),
      );

      const inventory = await tx.fuelInventory.create({
        data: {
          officeId,
          tankId: tank.id,
          documentNumber,
          countedAt: new Date(dto.countedAt),
          bookVolume,
          actualVolume: dto.actualVolume,
          difference,
          commission: dto.commission ?? null,
          notes: dto.notes ?? null,
          createdBy: userId,
        },
      });

      // Порог 0,5 % от объёма ёмкости: меньшее расхождение объясняется
      // погрешностью замера и температурным расширением.
      const threshold = Number(tank.capacity) * 0.005;
      if (Math.abs(difference) > threshold) {
        await tx.alert.create({
          data: {
            officeId,
            type: AlertType.INVENTORY_DISCREPANCY,
            severity: difference < 0 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
            entityType: 'FuelInventory',
            entityId: inventory.id,
            title: `Расхождение при инвентаризации ${tank.code}`,
            message:
              `Учёт ${bookVolume} л, факт ${dto.actualVolume} л, ` +
              `разница ${difference.toFixed(2)} л`,
            payload: { bookVolume, actualVolume: dto.actualVolume, difference, threshold },
            occurredAt: new Date(dto.countedAt),
            dedupeKey: `inventory:${inventory.id}`,
          },
        });
      }

      return inventory;
    });
  }

  // ─── Контроль аномалий ────────────────────────────────────────────────────

  /**
   * Ищет невозможные последовательности заправок.
   *
   * Классическая схема приписок: одна и та же машина «заправляется» дважды
   * за несколько минут в разных точках. Формально каждый документ корректен,
   * а вместе они невозможны.
   */
  private async detectAnomalies(
    officeId: number,
    issueId: number,
    vehicleId: number,
    issuedAt: Date,
  ): Promise<void> {
    try {
      const windowStart = new Date(issuedAt.getTime() - IMPOSSIBLE_SEQUENCE_MINUTES * 60_000);
      const windowEnd = new Date(issuedAt.getTime() + IMPOSSIBLE_SEQUENCE_MINUTES * 60_000);

      const neighbours = await this.prisma.db.fuelIssue.findMany({
        where: {
          officeId,
          vehicleId,
          deletedAt: null,
          id: { not: issueId },
          issuedAt: { gte: windowStart, lte: windowEnd },
        },
        select: { id: true, issuedAt: true, locationName: true, tankId: true, volume: true },
      });

      const suspicious = neighbours.filter(
        (n) => n.tankId !== null || (n.locationName ?? '') !== '',
      );

      if (suspicious.length === 0) return;

      await this.prisma.db.alert.create({
        data: {
          officeId,
          type: AlertType.FUEL_IMPOSSIBLE_SEQUENCE,
          severity: AlertSeverity.WARNING,
          vehicleId,
          entityType: 'FuelIssue',
          entityId: issueId,
          title: 'Подозрительная последовательность заправок',
          message:
            `Зафиксировано ${suspicious.length + 1} заправок одной единицы техники ` +
            `в пределах ${IMPOSSIBLE_SEQUENCE_MINUTES} минут`,
          payload: { issueId, neighbours: suspicious.map((n) => n.id) },
          occurredAt: issuedAt,
          dedupeKey: `fuel-sequence:${issueId}`,
        },
      });
    } catch (error) {
      this.logger.error(`Проверка аномалий ГСМ не выполнена: ${(error as Error).message}`);
    }
  }
}
