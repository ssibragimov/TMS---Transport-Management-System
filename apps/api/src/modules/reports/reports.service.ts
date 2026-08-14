import { Injectable } from '@nestjs/common';
import { Prisma, WaybillStatus } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';

export interface ReportPeriod {
  dateFrom: Date;
  dateTo: Date;
}

/** Строка отчёта по расходу топлива в разрезе техники. */
export interface FuelConsumptionRow {
  vehicleId: number;
  garageNumber: string;
  plateNumber: string | null;
  category: string;
  model: string;
  waybills: number;
  distanceKm: number;
  engineHours: number;
  normLitres: number;
  actualLitres: number;
  deviationLitres: number;
  deviationPct: number | null;
  issuedLitres: number;
  fuelCost: number;
  /** Литров на 100 км — сопоставимая метрика между офисами */
  litresPer100Km: number | null;
  /** Литров на моточас — для тягачей и стационарного оборудования */
  litresPerHour: number | null;
}

export interface DriverActivityRow {
  driverId: number;
  driver: string;
  personnelNumber: string;
  shifts: number;
  distanceKm: number;
  engineHours: number;
  normLitres: number;
  actualLitres: number;
  deviationPct: number | null;
}

export interface FuelMovementRow {
  tankId: number;
  code: string;
  name: string;
  fuelType: string;
  capacity: number;
  /** Расчётный остаток на начало периода: текущий минус приход плюс расход */
  openingVolume: number;
  receivedLitres: number;
  issuedLitres: number;
  closingVolume: number;
  receivedAmount: number;
  issuedAmount: number;
}

const num = (value: Prisma.Decimal | number | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value);
const round2 = (value: number): number => Math.round(value * 100) / 100;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Расход топлива по единицам техники.
   *
   * Считается только по ЗАКРЫТЫМ путевым листам: у незакрытых нет ни факта,
   * ни расчёта нормы, и включать их — значит занижать показатели.
   *
   * Агрегация делается в СУБД (groupBy), а не выборкой всех листов в память:
   * за год по крупному аэропорту это десятки тысяч строк.
   */
  async fuelConsumption(
    officeId: number,
    period: ReportPeriod,
    filters: { category?: string; departmentId?: number } = {},
  ): Promise<FuelConsumptionRow[]> {
    const where: Prisma.WaybillWhereInput = {
      officeId,
      deletedAt: null,
      status: WaybillStatus.CLOSED,
      validFrom: { gte: period.dateFrom, lte: period.dateTo },
      ...(filters.category || filters.departmentId
        ? {
            vehicle: {
              ...(filters.category && { category: filters.category as never }),
              ...(filters.departmentId && { departmentId: filters.departmentId }),
            },
          }
        : {}),
    };

    const grouped = await this.prisma.db.waybill.groupBy({
      by: ['vehicleId'],
      where,
      _count: { _all: true },
      _sum: {
        distanceKm: true,
        engineHours: true,
        fuelNorm: true,
        fuelConsumed: true,
        fuelIssued: true,
      },
    });

    if (grouped.length === 0) return [];

    const vehicleIds = grouped.map((g) => g.vehicleId);

    const [vehicles, costs] = await Promise.all([
      this.prisma.db.vehicle.findMany({
        where: { id: { in: vehicleIds } },
        select: {
          id: true,
          garageNumber: true,
          plateNumber: true,
          category: true,
          model: { select: { manufacturer: true, model: true } },
        },
      }),
      // Стоимость берётся из документов выдачи, а не из расхода в листе:
      // расход — это литры из бака, а деньги платятся за заправленное.
      this.prisma.db.fuelIssue.groupBy({
        by: ['vehicleId'],
        where: {
          officeId,
          deletedAt: null,
          vehicleId: { in: vehicleIds },
          issuedAt: { gte: period.dateFrom, lte: period.dateTo },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const costById = new Map(costs.map((c) => [c.vehicleId, num(c._sum.totalAmount)]));

    const rows = grouped.map<FuelConsumptionRow>((group) => {
      const vehicle = vehicleById.get(group.vehicleId);
      const distanceKm = round2(num(group._sum.distanceKm));
      const engineHours = round2(num(group._sum.engineHours));
      const normLitres = round2(num(group._sum.fuelNorm));
      const actualLitres = round2(num(group._sum.fuelConsumed));
      const deviationLitres = round2(actualLitres - normLitres);

      return {
        vehicleId: group.vehicleId,
        garageNumber: vehicle?.garageNumber ?? '—',
        plateNumber: vehicle?.plateNumber ?? null,
        category: vehicle?.category ?? '—',
        model: vehicle ? `${vehicle.model.manufacturer} ${vehicle.model.model}` : '—',
        waybills: group._count._all,
        distanceKm,
        engineHours,
        normLitres,
        actualLitres,
        deviationLitres,
        deviationPct: normLitres > 0 ? round2((deviationLitres / normLitres) * 100) : null,
        issuedLitres: round2(num(group._sum.fuelIssued)),
        fuelCost: round2(costById.get(group.vehicleId) ?? 0),
        litresPer100Km: distanceKm > 0 ? round2((actualLitres / distanceKm) * 100) : null,
        litresPerHour: engineHours > 0 ? round2(actualLitres / engineHours) : null,
      };
    });

    // Худшие по перерасходу сверху: отчёт открывают ради них.
    return rows.sort((a, b) => (b.deviationPct ?? -999) - (a.deviationPct ?? -999));
  }

  async driverActivity(
    officeId: number,
    period: ReportPeriod,
  ): Promise<DriverActivityRow[]> {
    const grouped = await this.prisma.db.waybill.groupBy({
      by: ['driverId'],
      where: {
        officeId,
        deletedAt: null,
        status: WaybillStatus.CLOSED,
        validFrom: { gte: period.dateFrom, lte: period.dateTo },
      },
      _count: { _all: true },
      _sum: {
        distanceKm: true,
        engineHours: true,
        fuelNorm: true,
        fuelConsumed: true,
      },
    });

    if (grouped.length === 0) return [];

    const drivers = await this.prisma.db.driver.findMany({
      where: { id: { in: grouped.map((g) => g.driverId) } },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        middleName: true,
        personnelNumber: true,
      },
    });
    const byId = new Map(drivers.map((d) => [d.id, d]));

    return grouped
      .map<DriverActivityRow>((group) => {
        const driver = byId.get(group.driverId);
        const normLitres = round2(num(group._sum.fuelNorm));
        const actualLitres = round2(num(group._sum.fuelConsumed));

        return {
          driverId: group.driverId,
          driver: driver
            ? `${driver.lastName} ${driver.firstName} ${driver.middleName ?? ''}`.trim()
            : '—',
          personnelNumber: driver?.personnelNumber ?? '—',
          shifts: group._count._all,
          distanceKm: round2(num(group._sum.distanceKm)),
          engineHours: round2(num(group._sum.engineHours)),
          normLitres,
          actualLitres,
          deviationPct:
            normLitres > 0 ? round2(((actualLitres - normLitres) / normLitres) * 100) : null,
        };
      })
      .sort((a, b) => (b.deviationPct ?? -999) - (a.deviationPct ?? -999));
  }

  /**
   * Движение топлива по ёмкостям.
   *
   * Остаток на начало периода вычисляется обратным ходом от текущего:
   * отдельной таблицы остатков нет намеренно — она неизбежно разошлась бы
   * с документами. Плата за это — отчёт за прошлый период меняется,
   * если задним числом провели документ; это правильное поведение.
   */
  async fuelMovement(officeId: number, period: ReportPeriod): Promise<FuelMovementRow[]> {
    const tanks = await this.prisma.db.fuelTank.findMany({
      where: { officeId, deletedAt: null },
      orderBy: { code: 'asc' },
      include: { fuelType: { select: { code: true, name: true } } },
    });

    if (tanks.length === 0) return [];

    const tankIds = tanks.map((t) => t.id);

    const [receiptsInPeriod, issuesInPeriod, receiptsAfter, issuesAfter] = await Promise.all([
      this.prisma.db.fuelReceipt.groupBy({
        by: ['tankId'],
        where: {
          officeId, deletedAt: null, tankId: { in: tankIds },
          receivedAt: { gte: period.dateFrom, lte: period.dateTo },
        },
        _sum: { volume: true, totalAmount: true },
      }),
      this.prisma.db.fuelIssue.groupBy({
        by: ['tankId'],
        where: {
          officeId, deletedAt: null, tankId: { in: tankIds },
          issuedAt: { gte: period.dateFrom, lte: period.dateTo },
        },
        _sum: { volume: true, totalAmount: true },
      }),
      this.prisma.db.fuelReceipt.groupBy({
        by: ['tankId'],
        where: {
          officeId, deletedAt: null, tankId: { in: tankIds },
          receivedAt: { gt: period.dateTo },
        },
        _sum: { volume: true },
      }),
      this.prisma.db.fuelIssue.groupBy({
        by: ['tankId'],
        where: {
          officeId, deletedAt: null, tankId: { in: tankIds },
          issuedAt: { gt: period.dateTo },
        },
        _sum: { volume: true },
      }),
    ]);

    const map = <T extends { tankId: number | null }>(rows: T[]) =>
      new Map(rows.filter((r) => r.tankId !== null).map((r) => [r.tankId as number, r]));

    const inRec = map(receiptsInPeriod);
    const inIss = map(issuesInPeriod);
    const afterRec = map(receiptsAfter);
    const afterIss = map(issuesAfter);

    return tanks.map<FuelMovementRow>((tank) => {
      const received = round2(num(inRec.get(tank.id)?._sum.volume));
      const issued = round2(num(inIss.get(tank.id)?._sum.volume));

      // Откручиваем текущий остаток назад через движения после периода.
      const closing = round2(
        num(tank.currentVolume) -
          num(afterRec.get(tank.id)?._sum.volume) +
          num(afterIss.get(tank.id)?._sum.volume),
      );

      return {
        tankId: tank.id,
        code: tank.code,
        name: tank.name,
        fuelType: tank.fuelType.name,
        capacity: num(tank.capacity),
        openingVolume: round2(closing - received + issued),
        receivedLitres: received,
        issuedLitres: issued,
        closingVolume: closing,
        receivedAmount: round2(num(inRec.get(tank.id)?._sum.totalAmount)),
        issuedAmount: round2(num(inIss.get(tank.id)?._sum.totalAmount)),
      };
    });
  }

  /** Сводка по офису за период — верхние плитки страницы отчётов. */
  async summary(officeId: number, period: ReportPeriod) {
    const [waybills, issues, alerts] = await Promise.all([
      this.prisma.db.waybill.aggregate({
        where: {
          officeId, deletedAt: null, status: WaybillStatus.CLOSED,
          validFrom: { gte: period.dateFrom, lte: period.dateTo },
        },
        _count: { _all: true },
        _sum: {
          distanceKm: true, engineHours: true, fuelNorm: true, fuelConsumed: true,
        },
      }),
      this.prisma.db.fuelIssue.aggregate({
        where: {
          officeId, deletedAt: null,
          issuedAt: { gte: period.dateFrom, lte: period.dateTo },
        },
        _sum: { volume: true, totalAmount: true },
      }),
      this.prisma.db.alert.count({
        where: {
          officeId,
          occurredAt: { gte: period.dateFrom, lte: period.dateTo },
          acknowledgedAt: null,
        },
      }),
    ]);

    const normLitres = round2(num(waybills._sum.fuelNorm));
    const actualLitres = round2(num(waybills._sum.fuelConsumed));

    return {
      waybills: waybills._count._all,
      distanceKm: round2(num(waybills._sum.distanceKm)),
      engineHours: round2(num(waybills._sum.engineHours)),
      normLitres,
      actualLitres,
      deviationLitres: round2(actualLitres - normLitres),
      deviationPct:
        normLitres > 0 ? round2(((actualLitres - normLitres) / normLitres) * 100) : null,
      issuedLitres: round2(num(issues._sum.volume)),
      fuelCost: round2(num(issues._sum.totalAmount)),
      openAlerts: alerts,
    };
  }
}
