/**
 * Движок расчёта нормативного расхода топлива.
 *
 * Живёт в shared намеренно: одна и та же функция считает норму на сервере
 * (при закрытии путевого листа) и на клиенте (предпросмотр в форме до сохранения).
 * Если бы логика была продублирована, диспетчер видел бы одну цифру, а в акт
 * попадала другая — самый частый источник конфликтов с бухгалтерией.
 *
 * Правила версионируются (validFrom/validTo). Перерасчёт за прошлый период берёт
 * те правила, что действовали НА ДАТУ путевого листа, а не текущие.
 */

import { NormType, NormAdjustmentKind } from './enums';
import { isWinterMonth } from './airports';

/** Базовое правило нормы. Одна техника может иметь несколько правил разных типов. */
export interface NormRule {
  id: number;
  normType: NormType;
  /** Л на 100 км / л на моточас / л на операцию / л на смену / л на т·км */
  baseRate: number;
  validFrom: Date;
  validTo: Date | null;
}

/** Надбавка. Либо процент от базы, либо абсолютная величина — не оба сразу. */
export interface NormAdjustment {
  id: number;
  kind: NormAdjustmentKind;
  /** Процент к базовому расходу, например 8 для зимней надбавки. */
  percent: number | null;
  /** Абсолютная надбавка в литрах за единицу базы (например +2 л/моточас на обогрев). */
  absolutePerUnit: number | null;
  /** К какому типу базы применяется. null — ко всей сумме базовых расходов. */
  appliesTo: NormType | null;
  validFrom: Date;
  validTo: Date | null;
  /** Сезонность: месяцы действия (1–12). null — круглый год. */
  seasonFromMonth: number | null;
  seasonToMonth: number | null;
}

/** Фактические показатели работы за период путевого листа. */
export interface WorkVolume {
  /** Пробег, км */
  distanceKm?: number;
  /** Отработано моточасов */
  engineHours?: number;
  /** Число операций (обработок ВС деайсером и т. п.) */
  operations?: number;
  /** Число смен — для нормы PER_SHIFT */
  shifts?: number;
  /** Транспортная работа, т·км */
  tonKm?: number;
}

export interface NormCalculationInput {
  /** Дата, на которую действуют правила (обычно дата начала путевого листа). */
  onDate: Date;
  volume: WorkVolume;
  rules: NormRule[];
  adjustments: NormAdjustment[];
  /** Округление результата, знаков после запятой. По умолчанию 2. */
  precision?: number;
}

/** Одна строка расшифровки — попадает в печатную форму путевого листа. */
export interface CalculationLine {
  /** Машинный ключ для i18n на клиенте */
  key: string;
  /** Тип базы или вид надбавки */
  normType: NormType | null;
  adjustmentKind: NormAdjustmentKind | null;
  /** Ставка (л/100км, л/мч, %) */
  rate: number;
  /** Объём работы, к которому применена ставка */
  quantity: number;
  /** Единица измерения объёма */
  unit: string;
  /** Литров по этой строке */
  litres: number;
}

export interface NormCalculationResult {
  /** Базовый расход без надбавок, л */
  baseLitres: number;
  /** Сумма надбавок, л */
  adjustmentLitres: number;
  /** Итоговая норма, л */
  totalLitres: number;
  /** Построчная расшифровка для печатной формы и разбора спорных случаев */
  lines: CalculationLine[];
  /** Правила, которых не хватило (например есть моточасы, но нет нормы на моточас) */
  warnings: string[];
}

const UNIT_BY_NORM_TYPE: Record<NormType, string> = {
  [NormType.PER_100KM]: 'км',
  [NormType.PER_ENGINE_HOUR]: 'мч',
  [NormType.PER_OPERATION]: 'оп',
  [NormType.PER_SHIFT]: 'смен',
  [NormType.PER_TON_KM]: 'т·км',
};

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isEffective(from: Date, to: Date | null, onDate: Date): boolean {
  if (onDate < from) return false;
  if (to !== null && onDate > to) return false;
  return true;
}

function isInSeason(adjustment: NormAdjustment, onDate: Date): boolean {
  const { seasonFromMonth, seasonToMonth } = adjustment;
  if (seasonFromMonth === null || seasonToMonth === null) return true;
  return isWinterMonth(onDate.getMonth() + 1, seasonFromMonth, seasonToMonth);
}

/** Объём работы, соответствующий типу нормы. */
function volumeForNormType(volume: WorkVolume, normType: NormType): number {
  switch (normType) {
    case NormType.PER_100KM:
      return volume.distanceKm ?? 0;
    case NormType.PER_ENGINE_HOUR:
      return volume.engineHours ?? 0;
    case NormType.PER_OPERATION:
      return volume.operations ?? 0;
    case NormType.PER_SHIFT:
      return volume.shifts ?? 0;
    case NormType.PER_TON_KM:
      return volume.tonKm ?? 0;
  }
}

/** Литры по одному базовому правилу. У PER_100KM ставка на сотню километров. */
function litresForRule(rule: NormRule, quantity: number): number {
  if (rule.normType === NormType.PER_100KM) return (rule.baseRate * quantity) / 100;
  return rule.baseRate * quantity;
}

/**
 * Считает нормативный расход.
 *
 * Порядок: сначала все базовые правила по своим объёмам работы, затем надбавки.
 * Надбавка с `appliesTo` применяется только к своей базе, без него — ко всей сумме.
 * Процентные и абсолютные надбавки не перемножаются между собой: каждая считается
 * от исходной базы, а не от базы с уже наложенными надбавками.
 */
export function calculateNormConsumption(
  input: NormCalculationInput,
): NormCalculationResult {
  const precision = input.precision ?? 2;
  const { onDate, volume } = input;
  const lines: CalculationLine[] = [];
  const warnings: string[] = [];

  const activeRules = input.rules.filter((r) => isEffective(r.validFrom, r.validTo, onDate));

  // ─── Базовый расход ────────────────────────────────────────────────────
  const baseByType = new Map<NormType, number>();
  let baseLitres = 0;

  for (const rule of activeRules) {
    const quantity = volumeForNormType(volume, rule.normType);
    if (quantity <= 0) continue;

    const litres = litresForRule(rule, quantity);
    baseByType.set(rule.normType, (baseByType.get(rule.normType) ?? 0) + litres);
    baseLitres += litres;

    lines.push({
      key: `norm.base.${rule.normType}`,
      normType: rule.normType,
      adjustmentKind: null,
      rate: rule.baseRate,
      quantity,
      unit: UNIT_BY_NORM_TYPE[rule.normType],
      litres: round(litres, precision),
    });
  }

  // Объём работы есть, а нормы под него нет — расход будет занижен, это надо видеть.
  const declaredTypes = new Set(activeRules.map((r) => r.normType));
  if ((volume.distanceKm ?? 0) > 0 && !declaredTypes.has(NormType.PER_100KM)) {
    warnings.push('norm.missing.PER_100KM');
  }
  if ((volume.engineHours ?? 0) > 0 && !declaredTypes.has(NormType.PER_ENGINE_HOUR)) {
    warnings.push('norm.missing.PER_ENGINE_HOUR');
  }

  // ─── Надбавки ──────────────────────────────────────────────────────────
  const activeAdjustments = input.adjustments.filter(
    (a) => isEffective(a.validFrom, a.validTo, onDate) && isInSeason(a, onDate),
  );

  let adjustmentLitres = 0;

  for (const adj of activeAdjustments) {
    // База, к которой привязана надбавка.
    const target = adj.appliesTo === null ? baseLitres : (baseByType.get(adj.appliesTo) ?? 0);
    if (target <= 0 && adj.absolutePerUnit === null) continue;

    let litres = 0;
    let rate = 0;
    let quantity = target;
    let unit = 'л';

    if (adj.percent !== null) {
      rate = adj.percent;
      litres = (target * adj.percent) / 100;
      unit = '%';
    } else if (adj.absolutePerUnit !== null && adj.appliesTo !== null) {
      // Абсолютная надбавка привязана к объёму работы, а не к литрам базы.
      quantity = volumeForNormType(volume, adj.appliesTo);
      if (quantity <= 0) continue;
      rate = adj.absolutePerUnit;
      litres = adj.absolutePerUnit * quantity;
      unit = UNIT_BY_NORM_TYPE[adj.appliesTo];
    } else {
      continue;
    }

    adjustmentLitres += litres;
    lines.push({
      key: `norm.adjustment.${adj.kind}`,
      normType: adj.appliesTo,
      adjustmentKind: adj.kind,
      rate,
      quantity,
      unit,
      litres: round(litres, precision),
    });
  }

  return {
    baseLitres: round(baseLitres, precision),
    adjustmentLitres: round(adjustmentLitres, precision),
    totalLitres: round(baseLitres + adjustmentLitres, precision),
    lines,
    warnings,
  };
}

/**
 * Отклонение факта от нормы.
 * Положительное — перерасход, отрицательное — экономия.
 */
export function calculateDeviation(
  actualLitres: number,
  normLitres: number,
  precision = 2,
): { absolute: number; percent: number | null } {
  const absolute = round(actualLitres - normLitres, precision);
  const percent = normLitres > 0 ? round((absolute / normLitres) * 100, precision) : null;
  return { absolute, percent };
}

/**
 * Остаток топлива в баке на конец периода.
 * Основное тождество путевого листа: остаток_нач + выдано − израсходовано = остаток_кон.
 */
export function calculateClosingFuel(
  openingLitres: number,
  issuedLitres: number,
  consumedLitres: number,
  precision = 2,
): number {
  return round(openingLitres + issuedLitres - consumedLitres, precision);
}
