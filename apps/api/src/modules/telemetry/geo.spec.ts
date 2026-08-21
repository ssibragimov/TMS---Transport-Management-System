import {
  type Ring,
  distanceToRingMeters,
  haversineMeters,
  isInsideStable,
  isValidRing,
  pointInRing,
  ringBounds,
  trackLengthKm,
} from '@gsm/shared';

/**
 * Квадрат примерно 800 × 800 метров вокруг координат ташкентского аэропорта.
 * Числа взяты реальные: на них видно, что расчёты не разъезжаются
 * на широтах Узбекистана.
 */
const APRON: Ring = [
  [69.2725, 41.2543],
  [69.2899, 41.2543],
  [69.2899, 41.2614],
  [69.2725, 41.2614],
];

const CENTER: [number, number] = [69.2812, 41.25786];

describe('haversineMeters', () => {
  it('считает расстояние между соседними точками трека', () => {
    // Примерно 111 метров: одна тысячная градуса широты.
    const d = haversineMeters([69.2812, 41.2578], [69.2812, 41.2588]);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(115);
  });

  it('возвращает ноль для совпадающих точек', () => {
    expect(haversineMeters(CENTER, CENTER)).toBe(0);
  });
});

describe('pointInRing', () => {
  it('видит точку внутри зоны', () => {
    expect(pointInRing(CENTER, APRON)).toBe(true);
  });

  it('видит точку снаружи', () => {
    expect(pointInRing([69.3200, 41.2578], APRON)).toBe(false);
  });

  it('не считает вырожденное кольцо зоной', () => {
    expect(pointInRing(CENTER, [[69.28, 41.25], [69.29, 41.26]])).toBe(false);
  });
});

describe('isInsideStable', () => {
  it('переключает состояние, когда точка ушла от границы', () => {
    const outside: [number, number] = [69.3100, 41.2578];
    expect(isInsideStable(outside, APRON, true)).toBe(false);
  });

  it('удерживает прежнее состояние у самой границы', () => {
    // Пять метров за границей: столько же гуляет бытовой приёмник,
    // и без гистерезиса это дало бы поток ложных въездов и выездов.
    const justOutside: [number, number] = [69.28996, 41.2578];
    expect(isInsideStable(justOutside, APRON, true)).toBe(true);
  });

  it('на первой точке гистерезис не применяется', () => {
    const justOutside: [number, number] = [69.28996, 41.2578];
    expect(isInsideStable(justOutside, APRON, null)).toBe(false);
  });
});

describe('distanceToRingMeters', () => {
  it('меряет расстояние до ближайшей стороны, а не до вершины', () => {
    // Точка напротив середины северной стороны.
    const near: [number, number] = [69.2812, 41.2620];
    const d = distanceToRingMeters(near, APRON);
    expect(d).toBeGreaterThan(50);
    expect(d).toBeLessThan(90);
  });
});

describe('trackLengthKm', () => {
  it('складывает длину отрезков', () => {
    const track: Array<[number, number]> = [
      [69.2812, 41.2578],
      [69.2812, 41.2588],
      [69.2812, 41.2598],
    ];
    expect(trackLengthKm(track)).toBeCloseTo(0.222, 2);
  });

  it('не накручивает пробег на стоящей машине', () => {
    // Дрожание приёмника на метр-полтора при неподвижной технике.
    const jitter: Array<[number, number]> = [
      [69.281200, 41.257860],
      [69.281205, 41.257863],
      [69.281198, 41.257858],
      [69.281202, 41.257861],
    ];
    expect(trackLengthKm(jitter)).toBe(0);
  });
});

describe('isValidRing', () => {
  it('отвергает кольцо из двух точек', () => {
    expect(isValidRing([[69.28, 41.25], [69.29, 41.26]])).toBe(false);
  });

  it('отвергает координаты за пределами Земли', () => {
    expect(isValidRing([[200, 41.25], [69.29, 41.26], [69.28, 41.27]])).toBe(false);
  });

  it('принимает корректный полигон', () => {
    expect(isValidRing(APRON)).toBe(true);
  });
});

describe('ringBounds', () => {
  it('возвращает габариты зоны для наведения карты', () => {
    expect(ringBounds(APRON)).toEqual([69.2725, 41.2543, 69.2899, 41.2614]);
  });
});
