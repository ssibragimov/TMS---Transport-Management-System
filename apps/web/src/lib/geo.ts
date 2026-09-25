/**
 * Геометрия для редактора геозон. Точка — [долгота, широта], кольцо хранится
 * незамкнутым (как в базе): замыкание делает отрисовка и проверка вхождения.
 */

export type LonLat = [number, number];

const METERS_PER_DEGREE = 111_320;

/** Метров в градусе долготы на данной широте. */
function metersPerLon(lat: number): number {
  return METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
}

/** Расстояние между двумя точками, м (плоское приближение — на масштабе перрона его достаточно). */
export function distanceM(a: LonLat, b: LonLat): number {
  const midLat = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * metersPerLon(midLat);
  const dy = (b[1] - a[1]) * METERS_PER_DEGREE;
  return Math.hypot(dx, dy);
}

/** Круг как многоугольник: 48 вершин дают отклонение от окружности меньше 0,3 %. */
export function circleRing(center: LonLat, radiusM: number, steps = 48): LonLat[] {
  const ring: LonLat[] = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (2 * Math.PI * i) / steps;
    ring.push([
      center[0] + (radiusM * Math.sin(angle)) / metersPerLon(center[1]),
      center[1] + (radiusM * Math.cos(angle)) / METERS_PER_DEGREE,
    ]);
  }
  return ring;
}

/** Прямоугольник по двум противоположным углам (стороны вдоль параллелей и меридианов). */
export function rectRing(a: LonLat, b: LonLat): LonLat[] {
  return [
    [a[0], a[1]],
    [b[0], a[1]],
    [b[0], b[1]],
    [a[0], b[1]],
  ];
}

/** Площадь многоугольника, м². */
export function ringAreaM2(ring: LonLat[]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
  const kx = metersPerLon(lat0);
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * kx * (y2 * METERS_PER_DEGREE) - x2 * kx * (y1 * METERS_PER_DEGREE);
  }
  return Math.abs(sum) / 2;
}

function orientation(a: LonLat, b: LonLat, c: LonLat): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsCross(a: LonLat, b: LonLat, c: LonLat, d: LonLat): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/**
 * Пересекает ли контур сам себя («бабочка»). У такой зоны понятие «внутри»
 * неоднозначно, поэтому сохранять её нельзя.
 */
export function selfIntersects(ring: LonLat[]): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      // Соседние рёбра делят вершину — их пересечением это не считается.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsCross(a, b, ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

/**
 * Куда вставить новую вершину, если щёлкнули рядом с ребром.
 * Возвращает индекс, на который встанет вершина, либо null, если рёбра далеко.
 * `project` переводит точку в пиксели экрана — порог задаётся в пикселях, а не
 * в метрах, чтобы попасть по линии было одинаково удобно на любом масштабе.
 */
export function edgeInsertIndex(
  ring: LonLat[],
  click: { x: number; y: number },
  project: (p: LonLat) => { x: number; y: number },
  thresholdPx = 10,
): number | null {
  let best: { index: number; distance: number } | null = null;
  for (let i = 0; i < ring.length; i += 1) {
    const a = project(ring[i]);
    const b = project(ring[(i + 1) % ring.length]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((click.x - a.x) * dx + (click.y - a.y) * dy) / lengthSq),
          );
    const distance = Math.hypot(click.x - (a.x + t * dx), click.y - (a.y + t * dy));
    if (distance <= thresholdPx && (!best || distance < best.distance)) {
      best = { index: i + 1, distance };
    }
  }
  return best ? best.index : null;
}
