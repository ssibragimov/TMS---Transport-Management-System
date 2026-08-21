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

  interface EventManager {
    add(event: string, handler: () => void): void;
  }

  interface GeoObject {
    events: EventManager;
  }

  interface GeoObjectCollection {
    add(object: GeoObject): void;
    removeAll(): void;
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
    destroy(): void;
  }

  interface PlacemarkOptions {
    preset?: string;
    iconColor?: string;
    zIndex?: number;
  }

  interface LineOptions {
    strokeColor?: string;
    strokeWidth?: number;
    strokeOpacity?: number;
    fillColor?: string;
    fillOpacity?: number;
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
      properties?: Record<string, unknown>,
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
