/**
 * Подключение Яндекс.Карт (JS API 2.1).
 *
 * Почему 2.1, а не 3: третья версия принимает ключ только с настроенным
 * ограничением по HTTP Referer, а домена у стенда пока нет — `localhost`
 * она не признаёт. Проверка нашего ключа показала ровно это: версия 3
 * отвечает «Invalid api key», версия 2.1 тот же ключ принимает.
 * Когда у стенда появится настоящий домен, переход на 3 будет уместен.
 *
 * Скрипт грузится по требованию — только при открытии телеметрии в офисе
 * аэропорта: суточный лимит бесплатного тарифа расходуется на каждой загрузке.
 */

export const YANDEX_MAPS_KEY: string | undefined =
  import.meta.env.VITE_YANDEX_MAPS_API_KEY || undefined;

/**
 * Промис загрузки один на всё приложение: карта монтируется и на вкладке,
 * и в панели трека, а второй тег скрипта Яндекс воспринимает как ошибку —
 * да и лимит запросов тратить дважды незачем.
 */
let loader: Promise<YMaps.Api> | null = null;

/**
 * Чтение глобальной переменной по факту, а не через сужение типа:
 * она появляется асинхронно, и проверка в начале функции ничего не говорит
 * о том, что будет в момент срабатывания onload.
 */
function globalApi(): YMaps.Api | undefined {
  return (window as unknown as { ymaps?: YMaps.Api }).ymaps;
}

export function loadYandexMaps(): Promise<YMaps.Api> {
  if (loader) return loader;

  if (!YANDEX_MAPS_KEY) {
    return Promise.reject(new Error('Ключ Яндекс.Карт не задан'));
  }

  loader = new Promise((resolve, reject) => {
    const existing = globalApi();
    if (existing) {
      existing.ready().then(() => resolve(existing)).catch(reject);
      return;
    }

    const script = document.createElement('script');
    const params = new URLSearchParams({ apikey: YANDEX_MAPS_KEY, lang: 'ru_RU' });
    script.src = `https://api-maps.yandex.ru/2.1/?${params.toString()}`;
    script.async = true;

    script.onload = () => {
      const maps = globalApi();
      if (!maps) {
        reject(new Error('Скрипт Яндекс.Карт загрузился, но API недоступен'));
        return;
      }
      // ymaps.ready() ждёт не только загрузку скрипта, но и подгрузку модулей.
      // Без него обращение к классам карты падает через раз.
      maps.ready().then(() => resolve(maps)).catch(reject);
    };

    script.onerror = () => {
      // Сбрасываем промис: в закрытой сети попытка может стать удачной после
      // того, как администратор откроет доступ к api-maps.yandex.ru.
      loader = null;
      reject(
        new Error(
          'Не удалось загрузить Яндекс.Карты: ключ отклонён либо нет доступа ' +
            'к api-maps.yandex.ru. Проверьте ключ в кабинете разработчика.',
        ),
      );
    };

    document.head.appendChild(script);
  });

  return loader;
}
