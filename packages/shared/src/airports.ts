/**
 * Аэропорты Узбекистана — исходные данные для создания офисов.
 * Используется seed'ом; в рантайме офисы читаются из БД (их можно добавлять в UI).
 */

export interface AirportSeed {
  /** Внутренний код офиса, участвует в номерах путевых листов: TAS-2026-000123 */
  code: string;
  iata: string;
  icao: string;
  nameRu: string;
  nameUz: string;
  nameEn: string;
  city: string;
  timezone: string;
  lat: number;
  lon: number;
  /**
   * Зимняя надбавка к норме расхода, %. У каждого региона своя —
   * это не глобальная константа, а параметр офиса.
   */
  winterSurchargePct: number;
  /** Период действия зимней надбавки: месяцы (1–12), включительно, с переходом через год. */
  winterFromMonth: number;
  winterToMonth: number;
}

export const UZBEKISTAN_AIRPORTS: AirportSeed[] = [
  {
    code: 'TAS', iata: 'TAS', icao: 'UTTT',
    nameRu: 'Ташкент (Ислам Каримов)', nameUz: 'Toshkent (Islom Karimov)', nameEn: 'Tashkent (Islam Karimov)',
    city: 'Ташкент', timezone: 'Asia/Tashkent',
    lat: 41.257861, lon: 69.281186,
    winterSurchargePct: 8, winterFromMonth: 11, winterToMonth: 3,
  },
  {
    code: 'SKD', iata: 'SKD', icao: 'UTSS',
    nameRu: 'Самарканд', nameUz: 'Samarqand', nameEn: 'Samarkand',
    city: 'Самарканд', timezone: 'Asia/Samarkand',
    lat: 39.700547, lon: 66.983829,
    winterSurchargePct: 9, winterFromMonth: 11, winterToMonth: 3,
  },
  {
    code: 'BHK', iata: 'BHK', icao: 'UTSB',
    nameRu: 'Бухара', nameUz: 'Buxoro', nameEn: 'Bukhara',
    city: 'Бухара', timezone: 'Asia/Samarkand',
    lat: 39.775000, lon: 64.483333,
    winterSurchargePct: 8, winterFromMonth: 11, winterToMonth: 3,
  },
  {
    code: 'KSQ', iata: 'KSQ', icao: 'UTSL',
    nameRu: 'Карши', nameUz: 'Qarshi', nameEn: 'Qarshi',
    city: 'Карши', timezone: 'Asia/Samarkand',
    lat: 38.833611, lon: 65.921389,
    winterSurchargePct: 7, winterFromMonth: 12, winterToMonth: 2,
  },
  {
    code: 'UGC', iata: 'UGC', icao: 'UTNU',
    nameRu: 'Ургенч', nameUz: 'Urganch', nameEn: 'Urgench',
    city: 'Ургенч', timezone: 'Asia/Samarkand',
    lat: 41.584336, lon: 60.641525,
    winterSurchargePct: 12, winterFromMonth: 11, winterToMonth: 3,
  },
  {
    code: 'NCU', iata: 'NCU', icao: 'UTNN',
    nameRu: 'Нукус', nameUz: 'Nukus', nameEn: 'Nukus',
    city: 'Нукус', timezone: 'Asia/Samarkand',
    lat: 42.488436, lon: 59.623333,
    winterSurchargePct: 12, winterFromMonth: 11, winterToMonth: 3,
  },
  {
    code: 'NMA', iata: 'NMA', icao: 'UTFN',
    nameRu: 'Наманган', nameUz: 'Namangan', nameEn: 'Namangan',
    city: 'Наманган', timezone: 'Asia/Tashkent',
    lat: 40.984578, lon: 71.556700,
    winterSurchargePct: 9, winterFromMonth: 11, winterToMonth: 3,
  },
  {
    code: 'FEG', iata: 'FEG', icao: 'UTFF',
    nameRu: 'Фергана', nameUz: 'Farg‘ona', nameEn: 'Fergana',
    city: 'Фергана', timezone: 'Asia/Tashkent',
    lat: 40.358864, lon: 71.745000,
    winterSurchargePct: 9, winterFromMonth: 11, winterToMonth: 3,
  },
  {
    code: 'AZN', iata: 'AZN', icao: 'UTFA',
    nameRu: 'Андижан', nameUz: 'Andijon', nameEn: 'Andijan',
    city: 'Андижан', timezone: 'Asia/Tashkent',
    lat: 40.727733, lon: 72.293967,
    winterSurchargePct: 9, winterFromMonth: 11, winterToMonth: 3,
  },
  {
    code: 'TMJ', iata: 'TMJ', icao: 'UTST',
    nameRu: 'Термез', nameUz: 'Termiz', nameEn: 'Termez',
    city: 'Термез', timezone: 'Asia/Samarkand',
    lat: 37.286667, lon: 67.310000,
    winterSurchargePct: 5, winterFromMonth: 12, winterToMonth: 2,
  },
  {
    code: 'NVI', iata: 'NVI', icao: 'UTSA',
    nameRu: 'Навои', nameUz: 'Navoiy', nameEn: 'Navoi',
    city: 'Навои', timezone: 'Asia/Samarkand',
    lat: 40.117222, lon: 65.170833,
    winterSurchargePct: 8, winterFromMonth: 11, winterToMonth: 3,
  },
  {
    code: 'AFS', iata: 'AFS', icao: 'UTSN',
    nameRu: 'Зарафшан', nameUz: 'Zarafshon', nameEn: 'Zarafshan',
    city: 'Зарафшан', timezone: 'Asia/Samarkand',
    lat: 41.613889, lon: 64.233333,
    winterSurchargePct: 10, winterFromMonth: 11, winterToMonth: 3,
  },
];

/** Проверка, попадает ли месяц в зимний период офиса (период может пересекать Новый год). */
export function isWinterMonth(month: number, fromMonth: number, toMonth: number): boolean {
  if (fromMonth <= toMonth) return month >= fromMonth && month <= toMonth;
  return month >= fromMonth || month <= toMonth;
}
