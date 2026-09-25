/**
 * Минимальные типы Яндекс.Карт (JS API 2.1).
 *
 * Пакета типов Яндекс не публикует, а карта живёт в глобальной переменной
 * ymaps, появляющейся после загрузки скрипта. Описываем только то, чем
 * пользуемся: полный API тянуть незачем, а `any` в проекте запрещён линтером.
 *
 * ВАЖНО про порядок координат: в версии 2.1 он [широта, долгота] —
 * обратный тому, что принят в GeoJSON и в нашей базе. Все преобразования
 * собраны в YandexAirportMap, чтобы путаница не расползалась по коду.
 */

declare namespace YMaps {
  /** [широта, долгота] — порядок Яндекса в версии 2.1. */
  type LatLng = [number, number];

  interface MapEvent {
    get(name: string): unknown;
    stopPropagation(): void;
    preventDefault(): void;
  }

  interface EventManager {
    add(event: string, handler: (event: MapEvent) => void): void;
  }

  interface Geometry {
    getCoordinates(): unknown;
    setCoordinates(coordinates: unknown): void;
  }

  interface GeoObject {
    events: EventManager;
    geometry: Geometry;
  }

  interface GeoObjectCollection {
    add(object: GeoObject): void;
    remove(object: GeoObject): void;
    removeAll(): void;
  }

  interface CursorAccessor {
    remove(): void;
  }

  interface MapState {
    center: LatLng;
    zoom: number;
    /** 'yandex#map' | 'yandex#satellite' | 'yandex#hybrid' */
    type?: string;
    controls?: string[];
  }

  interface MapOptions {
    /** Прямоугольник, за который карту не выпускают: [[юг, запад], [север, восток]]. */
    restrictMapArea?: [LatLng, LatLng];
    minZoom?: number;
    maxZoom?: number;
    /** Убирает блок «Открыть в Яндекс.Картах». */
    suppressMapOpenBlock?: boolean;
  }

  interface Map {
    geoObjects: GeoObjectCollection;
    events: EventManager;
    behaviors: { disable(name: string | string[]): void };
    cursors: { push(type: string): CursorAccessor };
    getZoom(): number;
    setBounds(
      bounds: [LatLng, LatLng],
      options?: { checkZoomRange?: boolean; zoomMargin?: number },
    ): Promise<void>;
    destroy(): void;
  }

  interface PlacemarkOptions {
    preset?: string;
    iconColor?: string;
    zIndex?: number;
    draggable?: boolean;
    iconLayout?: string;
    iconImageHref?: string;
    iconImageSize?: [number, number];
    iconImageOffset?: [number, number];
    hasBalloon?: boolean;
    hasHint?: boolean;
  }

  interface LineOptions {
    strokeColor?: string;
    strokeWidth?: number;
    strokeOpacity?: number;
    strokeStyle?: string;
    fillColor?: string;
    fillOpacity?: number;
    /** 'default#transparent' — объект не перехватывает щелчки, они идут в карту */
    interactivityModel?: string;
    zIndex?: number;
  }

  interface Api {
    ready(): Promise<void>;
    Map: new (element: HTMLElement, state: MapState, options?: MapOptions) => Map;
    Placemark: new (
      coordinates: LatLng,
      properties?: { iconCaption?: string; hintContent?: string },
      options?: PlacemarkOptions,
    ) => GeoObject;
    Polygon: new (
      geometry: LatLng[][],
      properties?: { hintContent?: string },
      options?: LineOptions,
    ) => GeoObject;
    Polyline: new (
      geometry: LatLng[],
      properties?: Record<string, unknown>,
      options?: LineOptions,
    ) => GeoObject;
  }
}

declare const ymaps: YMaps.Api | undefined;
