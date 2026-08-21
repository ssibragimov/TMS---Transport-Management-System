import type { StyleSpecification } from 'maplibre-gl';
import themeLayers from 'protomaps-themes-base';

/**
 * Стиль подложки для карты аэродрома.
 *
 * Всё лежит рядом с приложением: тайлы одним файлом .pmtiles, шрифты и
 * значки — статикой. Ни одного обращения наружу, поэтому карта работает
 * в технологической сети аэропорта, где интернета может не быть, и не
 * зависит ни от чьего тарифа.
 *
 * Данные — OpenStreetMap. Для перрона это удачнее спутникового снимка:
 * у стоянок и рулёжных дорожек есть номера, а на фотографии виден
 * только бетон.
 */

/**
 * Каталог с подложкой — абсолютным адресом.
 *
 * Относительный путь MapLibre отвергает: «Invalid sprite URL, must be
 * absolute». Спецификация стиля допускает относительные ссылки, но
 * реализация требует полного адреса, поэтому собираем его от текущей
 * страницы. Заодно это переживает публикацию в подкаталоге
 * (GitHub Pages), где base отличается от корня.
 *
 * Считается при вызове, а не при загрузке модуля: адрес страницы нужен
 * только в браузере, и вычисление на уровне модуля мешало бы сборке.
 */
function mapBase(): string {
  const path = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/map/`;
  return new URL(path, window.location.href).toString().replace(/\/$/, '');
}

export function tilesUrl(): string {
  return `${mapBase()}/tashkent.pmtiles`;
}

/**
 * Есть ли файл тайлов на сервере.
 *
 * Файл в репозиторий не кладётся — он большой и восстанавливается командой
 * `npm run map:tiles`. Без него раздел не должен падать: карта уступает
 * место встроенной схеме.
 */
export async function basemapAvailable(): Promise<boolean> {
  try {
    // Диапазонный запрос вместо HEAD: некоторые статические серверы
    // на HEAD отвечают иначе, чем на GET, и проверка врала бы.
    const response = await fetch(tilesUrl(), { headers: { Range: 'bytes=0-15' } });
    if (!response.ok) return false;

    const head = new Uint8Array(await response.arrayBuffer());
    // Файл начинается с сигнатуры PMTiles. Проверяем её, потому что
    // сервер мог отдать страницу с ошибкой под видом успешного ответа.
    return String.fromCharCode(...head.slice(0, 7)) === 'PMTiles';
  } catch {
    return false;
  }
}

export function buildStyle(): StyleSpecification {
  const base = mapBase();

  return {
    version: 8,
    glyphs: `${base}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${base}/sprites/light`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${tilesUrl()}`,
        attribution: '© OpenStreetMap',
      },
    },
    // Подписи по-русски: у объектов OSM в Ташкенте русское название есть
    // почти всегда, а латиница читается службой хуже.
    layers: themeLayers('protomaps', 'light', 'ru'),
  };
}
