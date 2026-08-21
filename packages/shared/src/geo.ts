/**
 * Геометрия для телеметрии.
 *
 * Здесь, а не в API, по той же причине, что и нормы расхода: одна и та же
 * функция нужна серверу (разбор входящей точки) и клиенту (подсветка зоны
 * при рисовании, предупреждение «полигон незамкнут» до отправки формы).
 * Две реализации разошлись бы, и расхождение вылезло бы на разборе инцидента.
 *
 * PostGIS не используется намеренно: расширение доступно не в каждой среде,
 * геозон у аэропорта единицы, а вычисления ниже — арифметика над парой чисел.
 */

/** Точка в порядке GeoJSON: [долгота, широта]. */
export type LngLat = [number, number];

/** Внешнее кольцо полигона. Замыкающая точка необязательна. */
export type Ring = LngLat[];

/** Средний радиус Земли, м. */
const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Расстояние между точками по большому кругу, метры.
 *
 * Формула гаверсинуса, а не проекция: на масштабах аэродрома (единицы
 * километров) её погрешность — сантиметры, зато нет привязки к зоне UTM.
 */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Лежит ли точка внутри кольца — алгоритм трассировки луча.
 *
 * Луч пускается вдоль параллели вправо и считается число пересечений сторон:
 * нечётное — внутри. Сравнение долгот ведётся без проекции: на широтах
 * Узбекистана и размерах геозоны в пределах аэродрома искажение меньше
 * точности бытового GPS-приёмника.
 *
 * Точка ровно на границе может попасть в любую сторону — для контроля
 * въезда на перрон это несущественно, гистерезис даёт запас (см. hysteresis).
 */
export function pointInRing(point: LngLat, ring: Ring): boolean {
  if (ring.length < 3) return false;

  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    // Сторона пересекает параллель точки, и точка левее места пересечения.
    const straddles = yi > y !== yj > y;
    if (!straddles) continue;

    const xCross = xi + ((y - yi) * (xj - xi)) / (yj - yi);
    if (x < xCross) inside = !inside;
  }

  return inside;
}

/**
 * Проверка вхождения с гистерезисом.
 *
 * Без него техника, стоящая у самой границы перрона, порождала бы поток
 * событий «въехал — выехал» при каждом дрожании координаты: бытовой приёмник
 * гуляет на 3–5 метров, а между ангарами и того больше. Пока точка ближе
 * `toleranceMeters` к границе, состояние остаётся прежним.
 *
 * @param wasInside предыдущее состояние; при первой точке передаётся null
 */
export function isInsideStable(
  point: LngLat,
  ring: Ring,
  wasInside: boolean | null,
  toleranceMeters = 15,
): boolean {
  const inside = pointInRing(point, ring);
  if (wasInside === null || inside === wasInside) return inside;

  // Состояние меняется — но только если точка ушла от границы достаточно далеко.
  return distanceToRingMeters(point, ring) >= toleranceMeters ? inside : wasInside;
}

/** Кратчайшее расстояние от точки до границы кольца, метры. */
export function distanceToRingMeters(point: LngLat, ring: Ring): number {
  let min = Number.POSITIVE_INFINITY;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    min = Math.min(min, distanceToSegmentMeters(point, ring[j], ring[i]));
  }

  return min;
}

/**
 * Расстояние от точки до отрезка, метры.
 *
 * Отрезок проецируется в локальные метры относительно первой вершины:
 * на длине стороны геозоны кривизна Земли роли не играет, зато задача
 * сводится к школьной планиметрии.
 */
function distanceToSegmentMeters(point: LngLat, a: LngLat, b: LngLat): number {
  const mPerDegLat = (Math.PI * EARTH_RADIUS_M) / 180;
  const mPerDegLon = mPerDegLat * Math.cos(toRad(a[1]));

  const px = (point[0] - a[0]) * mPerDegLon;
  const py = (point[1] - a[1]) * mPerDegLat;
  const bx = (b[0] - a[0]) * mPerDegLon;
  const by = (b[1] - a[1]) * mPerDegLat;

  const lenSq = bx * bx + by * by;
  if (lenSq === 0) return Math.hypot(px, py);

  // Доля проекции точки на отрезок, зажатая его концами.
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  return Math.hypot(px - t * bx, py - t * by);
}

/**
 * Длина трека, километры.
 *
 * Точки с нулевым смещением отбрасываются: стоящая машина шлёт координату
 * каждые несколько секунд, и дрожание приёмника иначе накрутило бы
 * несуществующий пробег — за смену это набегает в километры.
 */
export function trackLengthKm(points: LngLat[], minStepMeters = 5): number {
  let meters = 0;

  for (let i = 1; i < points.length; i++) {
    const step = haversineMeters(points[i - 1], points[i]);
    if (step >= minStepMeters) meters += step;
  }

  return meters / 1000;
}

/** Валиден ли полигон геозоны: минимум три несовпадающие вершины. */
export function isValidRing(ring: unknown): ring is Ring {
  if (!Array.isArray(ring) || ring.length < 3) return false;

  return ring.every(
    (p) =>
      Array.isArray(p) &&
      p.length === 2 &&
      typeof p[0] === 'number' &&
      typeof p[1] === 'number' &&
      Math.abs(p[0]) <= 180 &&
      Math.abs(p[1]) <= 90,
  );
}

/** Прямоугольник, охватывающий кольцо: [minLon, minLat, maxLon, maxLat]. */
export function ringBounds(ring: Ring): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }

  return [minLon, minLat, maxLon, maxLat];
}
