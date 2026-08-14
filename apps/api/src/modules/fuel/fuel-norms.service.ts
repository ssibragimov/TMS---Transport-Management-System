import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  NormAdjustmentKind,
  calculateNormConsumption,
  type NormAdjustment,
  type NormCalculationResult,
  type NormRule,
  type WorkVolume,
} from '@gsm/shared';

import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * Подбор действующих норм и расчёт нормативного расхода.
 *
 * Сама арифметика живёт в packages/shared, чтобы клиент показывал в форме
 * ровно ту цифру, которая попадёт в закрытый путевой лист. Здесь — только
 * выбор правил: какая норма применима к этой технике на эту дату.
 *
 * Приоритет: норма конкретной единицы техники перекрывает норму модели.
 * Норма выбирается по дате путевого листа, а не по текущей дате: перерасчёт
 * за прошлый месяц должен дать тот же результат, что и тогда.
 */
@Injectable()
export class FuelNormsService {
  private readonly logger = new Logger(FuelNormsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async calculateForVehicle(
    officeId: number,
    vehicleId: number,
    volume: WorkVolume,
    onDate: Date,
  ): Promise<NormCalculationResult> {
    const { rules, adjustments } = await this.resolveNorms(officeId, vehicleId, onDate);

    if (rules.length === 0) {
      this.logger.warn(
        `Для техники ${vehicleId} на ${onDate.toISOString().slice(0, 10)} не найдено ни одной нормы`,
      );
    }

    return calculateNormConsumption({ onDate, volume, rules, adjustments });
  }

  /**
   * Возвращает набор правил и надбавок, применимых к технике на дату.
   * Публичный метод: тот же набор отдаётся клиенту для предпросмотра расчёта.
   */
  async resolveNorms(
    officeId: number,
    vehicleId: number,
    onDate: Date,
  ): Promise<{ rules: NormRule[]; adjustments: NormAdjustment[] }> {
    const vehicle = await this.prisma.db.vehicle.findFirstOrThrow({
      where: { id: vehicleId, officeId },
      select: { id: true, modelId: true },
    });

    const effective: Prisma.FuelNormWhereInput = {
      officeId,
      deletedAt: null,
      validFrom: { lte: onDate },
      OR: [{ validTo: null }, { validTo: { gte: onDate } }],
    };

    const norms = await this.prisma.db.fuelNorm.findMany({
      where: {
        AND: [
          effective,
          { OR: [{ vehicleId: vehicle.id }, { modelId: vehicle.modelId }] },
        ],
      },
      include: { adjustments: true },
      // Сначала нормы уровня техники, затем — уровня модели.
      // На один тип нормы берётся первая встреченная.
      orderBy: [{ vehicleId: 'desc' }, { validFrom: 'desc' }],
    });

    const rules: NormRule[] = [];
    const adjustments: NormAdjustment[] = [];
    const seenTypes = new Set<string>();

    for (const norm of norms) {
      if (seenTypes.has(norm.normType)) continue;
      seenTypes.add(norm.normType);

      rules.push({
        id: norm.id,
        normType: norm.normType,
        baseRate: Number(norm.baseRate),
        validFrom: norm.validFrom,
        validTo: norm.validTo,
      });

      for (const adj of norm.adjustments) {
        adjustments.push({
          id: adj.id,
          kind: adj.kind,
          percent: adj.percent === null ? null : Number(adj.percent),
          absolutePerUnit:
            adj.absolutePerUnit === null ? null : Number(adj.absolutePerUnit),
          appliesTo: adj.appliesTo,
          validFrom: adj.validFrom,
          validTo: adj.validTo,
          seasonFromMonth: adj.seasonFromMonth,
          seasonToMonth: adj.seasonToMonth,
        });
      }
    }

    const withOfficeWinter = await this.appendOfficeWinterSurcharge(
      officeId,
      adjustments,
    );

    return { rules, adjustments: withOfficeWinter };
  }

  /**
   * Зимняя надбавка офиса.
   *
   * Задаётся один раз в карточке аэропорта и применяется ко всей технике —
   * иначе её пришлось бы дублировать в каждой норме, а при смене приказа
   * править сотни записей. Если у конкретной нормы своя зимняя надбавка,
   * она перекрывает офисную.
   */
  private async appendOfficeWinterSurcharge(
    officeId: number,
    adjustments: NormAdjustment[],
  ): Promise<NormAdjustment[]> {
    const hasOwnWinter = adjustments.some((a) => a.kind === NormAdjustmentKind.WINTER);
    if (hasOwnWinter) return adjustments;

    const office = await this.prisma.db.office.findUnique({
      where: { id: officeId },
      select: {
        winterSurchargePct: true,
        winterFromMonth: true,
        winterToMonth: true,
      },
    });

    const percent = Number(office?.winterSurchargePct ?? 0);
    if (!office || percent <= 0) return adjustments;

    return [
      ...adjustments,
      {
        // Синтетическая надбавка, в БД её нет — отсюда отрицательный id.
        id: -1,
        kind: NormAdjustmentKind.WINTER,
        percent,
        absolutePerUnit: null,
        appliesTo: null,
        validFrom: new Date(1970, 0, 1),
        validTo: null,
        seasonFromMonth: office.winterFromMonth,
        seasonToMonth: office.winterToMonth,
      },
    ];
  }
}
