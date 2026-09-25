import type { LonLat } from '@/lib/geo';

/**
 * Общий договор между редактором зоны и картой, на которой она рисуется.
 *
 * Карт две — Яндекс (основная) и MapLibre с OpenStreetMap (запасная, когда
 * ключа Яндекса нет или он отклонён). Вся логика рисования живёт в редакторе,
 * а карта только показывает состояние и сообщает, что с ней сделали. Поэтому
 * замена подложки не затрагивает ни инструменты, ни форму.
 */

export interface CanvasOtherZone {
  name: string;
  color: string;
  area: LonLat[];
}

export interface CanvasClick {
  point: LonLat;
  /** Индекс вершины под курсором (в пределах 12 пикселей) или null */
  nearest: number | null;
  /** Куда вставить вершину, если щёлкнули по ребру, иначе null */
  insertIndex: number | null;
}

export interface CanvasProps {
  center: LonLat;
  others: CanvasOtherZone[];
  ring: LonLat[];
  color: string;
  /** Контур ещё рисуется: курсор — прицел, а не рука */
  drawing: boolean;
  /** Первая вершина крупнее — по ней замыкается многоугольник */
  closingFirst: boolean;
  /** Первый щелчок круга или прямоугольника, пока нет второго */
  pending: LonLat | null;
  /** У круга вместо вершин показывается только центр */
  circleCenter: LonLat | null;
  onClick: (click: CanvasClick) => void;
  onVertexMove: (index: number, point: LonLat) => void;
  onVertexDelete: (index: number) => void;
  /** Карта не открылась: причина для пояснения и переход на запасную */
  onUnavailable?: (reason: string) => void;
  /** Фон карты не догрузился — рисовать по-прежнему можно */
  onTilesError?: () => void;
}

/** Порог попадания по вершине, пиксели */
export const VERTEX_HIT_PX = 12;
