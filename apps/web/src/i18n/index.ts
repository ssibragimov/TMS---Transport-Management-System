import enUS from 'antd/locale/en_US';
import ruRU from 'antd/locale/ru_RU';
import uzUZ from 'antd/locale/uz_UZ';
import type { Locale as AntdLocale } from 'antd/es/locale';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ru';
import 'dayjs/locale/uz-latn';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './en';
import { uz } from './uz';

/**
 * Мультиязычность интерфейса.
 *
 * Ключом перевода служит сам русский текст, а не искусственное имя вроде
 * `vehicles.title`. Причина практическая: интерфейс уже был написан по-русски,
 * и перевод свёлся к обёртыванию строк в t() без придумывания сотни имён и
 * без риска, что имя и содержимое разойдутся. Русский словарь при этом не
 * нужен вовсе — i18next возвращает сам ключ, если перевода нет.
 *
 * Следствие, о котором надо помнить: правка русского текста в коде
 * равносильна смене ключа, и перевод нужно поправить в uz.ts и en.ts.
 *
 * Смена языка меняет три вещи сразу, и все три обязательны:
 *   1) строки интерфейса — react-i18next перерисовывает дерево сам;
 *   2) локаль Ant Design — иначе календари, пагинация и «Нет данных»
 *      останутся русскими независимо от выбранного языка;
 *   3) локаль dayjs — иначе названия месяцев и первый день недели
 *      не совпадут с интерфейсом.
 */

export interface LocaleDescriptor {
  code: string;
  /** Название языка на нём самом — так его узнают быстрее всего. */
  label: string;
  /** Локаль Ant Design: календари, пагинация, стандартные подписи. */
  antd: AntdLocale;
  /** Локаль dayjs: названия месяцев, первый день недели. */
  dayjs: string;
  /** Код страны для флага. */
  flag: 'uz' | 'gb' | 'ru';
}

export const SUPPORTED_LOCALES: LocaleDescriptor[] = [
  { code: 'uz', label: 'O‘zbek', antd: uzUZ, dayjs: 'uz-latn', flag: 'uz' },
  { code: 'en', label: 'English', antd: enUS, dayjs: 'en', flag: 'gb' },
  { code: 'ru', label: 'Русский', antd: ruRU, dayjs: 'ru', flag: 'ru' },
];

export const DEFAULT_LOCALE = 'ru';

/**
 * Ключ явного выбора языка на этом устройстве.
 *
 * Именно «явного»: его наличие означает, что человек переключал язык сам,
 * и профильная настройка со стороны сервера этот выбор не перебивает
 * (см. applyProfileLocale в AuthContext).
 */
export const LOCALE_STORAGE_KEY = 'gsm.locale';

export function localeDescriptor(code: string | undefined): LocaleDescriptor {
  return (
    SUPPORTED_LOCALES.find((locale) => locale.code === code) ??
    SUPPORTED_LOCALES.find((locale) => locale.code === DEFAULT_LOCALE)!
  );
}

/**
 * Побочные эффекты смены языка, которые React сам не сделает.
 * Вызывается и при старте, и при каждом переключении.
 */
export function applyLocaleSideEffects(code: string): void {
  const locale = localeDescriptor(code);
  dayjs.locale(locale.dayjs);
  // Влияет на переносы, подбор шрифта и работу программ чтения с экрана.
  document.documentElement.lang = locale.code;
}

const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
const initialLocale = localeDescriptor(
  storedLocale ?? (import.meta.env.VITE_DEFAULT_LOCALE as string | undefined) ?? DEFAULT_LOCALE,
).code;

void i18n.use(initReactI18next).init({
  resources: {
    // Русского словаря нет намеренно: ключ и есть русский текст.
    ru: { translation: {} },
    uz: { translation: uz },
    en: { translation: en },
  },
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  // Точки и двоеточия встречаются внутри самих строк («л на т·км», «Итого:»),
  // и без этого i18next принял бы их за разделители пространств имён.
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
});

applyLocaleSideEffects(initialLocale);
i18n.on('languageChanged', applyLocaleSideEffects);

export default i18n;
