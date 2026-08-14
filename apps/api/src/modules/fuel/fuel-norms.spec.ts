import {
  NormAdjustmentKind,
  NormType,
  calculateClosingFuel,
  calculateDeviation,
  calculateNormConsumption,
  type NormAdjustment,
  type NormRule,
} from '@gsm/shared';

/**
 * Тесты движка норм. Это единственный кусок логики, цифры которого попадают
 * в бухгалтерские документы, поэтому он покрыт в первую очередь.
 */

const YEAR_START = new Date(2026, 0, 1);

function rule(normType: NormType, baseRate: number, id = 1): NormRule {
  return { id, normType, baseRate, validFrom: YEAR_START, validTo: null };
}

function adjustment(partial: Partial<NormAdjustment> & { kind: NormAdjustmentKind }): NormAdjustment {
  return {
    id: 1,
    percent: null,
    absolutePerUnit: null,
    appliesTo: null,
    validFrom: YEAR_START,
    validTo: null,
    seasonFromMonth: null,
    seasonToMonth: null,
    ...partial,
  };
}

describe('calculateNormConsumption', () => {
  it('считает норму по пробегу на сотню километров', () => {
    const result = calculateNormConsumption({
      onDate: new Date(2026, 5, 15),
      volume: { distanceKm: 250 },
      rules: [rule(NormType.PER_100KM, 42)],
      adjustments: [],
    });

    // 42 л/100 км × 250 км = 105 л
    expect(result.baseLitres).toBe(105);
    expect(result.totalLitres).toBe(105);
  });

  it('складывает базы разных типов — как у тягача с моточасами', () => {
    const result = calculateNormConsumption({
      onDate: new Date(2026, 5, 15),
      volume: { distanceKm: 12, engineHours: 9 },
      rules: [rule(NormType.PER_100KM, 38, 1), rule(NormType.PER_ENGINE_HOUR, 14, 2)],
      adjustments: [],
    });

    // 38 × 12 / 100 = 4.56 л пробега + 14 × 9 = 126 л моточасов
    expect(result.baseLitres).toBe(130.56);
    expect(result.lines).toHaveLength(2);
  });

  it('применяет зимнюю надбавку только в сезон', () => {
    const winter = adjustment({
      kind: NormAdjustmentKind.WINTER,
      percent: 10,
      seasonFromMonth: 11,
      seasonToMonth: 3,
    });

    const january = calculateNormConsumption({
      onDate: new Date(2026, 0, 20),
      volume: { distanceKm: 100 },
      rules: [rule(NormType.PER_100KM, 40)],
      adjustments: [winter],
    });

    const july = calculateNormConsumption({
      onDate: new Date(2026, 6, 20),
      volume: { distanceKm: 100 },
      rules: [rule(NormType.PER_100KM, 40)],
      adjustments: [winter],
    });

    expect(january.totalLitres).toBe(44);
    expect(july.totalLitres).toBe(40);
  });

  it('не применяет норму, срок действия которой ещё не наступил', () => {
    const future: NormRule = {
      id: 1,
      normType: NormType.PER_100KM,
      baseRate: 50,
      validFrom: new Date(2027, 0, 1),
      validTo: null,
    };

    const result = calculateNormConsumption({
      onDate: new Date(2026, 5, 1),
      volume: { distanceKm: 100 },
      rules: [future],
      adjustments: [],
    });

    expect(result.totalLitres).toBe(0);
    // Пробег есть, а нормы под него нет — это должно быть видно.
    expect(result.warnings).toContain('norm.missing.PER_100KM');
  });

  it('считает абсолютную надбавку от объёма работы, а не от литров базы', () => {
    const result = calculateNormConsumption({
      onDate: new Date(2026, 5, 15),
      volume: { engineHours: 10 },
      rules: [rule(NormType.PER_ENGINE_HOUR, 12)],
      adjustments: [
        adjustment({
          kind: NormAdjustmentKind.IDLE_EQUIPMENT,
          absolutePerUnit: 2,
          appliesTo: NormType.PER_ENGINE_HOUR,
        }),
      ],
    });

    // База 120 л + надбавка 2 л/мч × 10 мч = 20 л
    expect(result.baseLitres).toBe(120);
    expect(result.adjustmentLitres).toBe(20);
    expect(result.totalLitres).toBe(140);
  });

  it('начисляет надбавки от исходной базы, а не каскадом', () => {
    const result = calculateNormConsumption({
      onDate: new Date(2026, 0, 15),
      volume: { distanceKm: 100 },
      rules: [rule(NormType.PER_100KM, 100)],
      adjustments: [
        adjustment({ kind: NormAdjustmentKind.WINTER, percent: 10, id: 1 }),
        adjustment({ kind: NormAdjustmentKind.AIR_CONDITIONING, percent: 5, id: 2 }),
      ],
    });

    // 100 + 10 % от 100 + 5 % от 100 = 115, а не 100 × 1.1 × 1.05 = 115.5
    expect(result.totalLitres).toBe(115);
  });
});

describe('calculateDeviation', () => {
  it('показывает перерасход положительным числом', () => {
    expect(calculateDeviation(115, 100)).toEqual({ absolute: 15, percent: 15 });
  });

  it('показывает экономию отрицательным числом', () => {
    expect(calculateDeviation(90, 100)).toEqual({ absolute: -10, percent: -10 });
  });

  it('не делит на ноль при отсутствующей норме', () => {
    expect(calculateDeviation(30, 0)).toEqual({ absolute: 30, percent: null });
  });
});

describe('calculateClosingFuel', () => {
  it('соблюдает тождество путевого листа', () => {
    // остаток_нач + выдано − израсходовано = остаток_кон
    expect(calculateClosingFuel(50, 120, 140)).toBe(30);
  });
});
