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

/**
 * Мультиязычность подключена с первого дня намеренно.
 *
 * Платформа разворачивается в аэропортах всей страны, и требование
 * узбекского интерфейса возникнет обязательно. Дописывать i18n в готовый
 * продукт втрое дороже, чем заложить его в каркас.
 *
 * Смена языка меняет три вещи сразу, и все три обязательны:
 *   1) строки интерфейса — react-i18next перерисовывает дерево сам;
 *   2) локаль Ant Design — иначе календари, пагинация и «Нет данных»
 *      останутся русскими независимо от выбранного языка;
 *   3) локаль dayjs — иначе названия месяцев и первый день недели
 *      не совпадут с интерфейсом.
 */

const ru = {
  common: {
    save: 'Сохранить',
    cancel: 'Отмена',
    delete: 'Удалить',
    edit: 'Изменить',
    create: 'Создать',
    search: 'Поиск',
    loading: 'Загрузка…',
    noData: 'Нет данных',
    actions: 'Действия',
    confirm: 'Подтвердить',
  },
  nav: {
    dashboard: 'Главная',
    vehicles: 'Транспорт',
    drivers: 'Водители',
    fuel: 'ГСМ',
    waybills: 'Путевые листы',
    maintenance: 'ТО и ремонты',
    reports: 'Отчёты',
    users: 'Пользователи',
    admin: 'Администрирование',
    audit: 'Журнал действий',
    settings: 'Настройки',
    collapseMenu: 'Свернуть меню',
    expandMenu: 'Развернуть меню',
  },
  auth: {
    title: 'Вход в систему',
    subtitle: 'Учёт спецтранспорта и ГСМ',
    email: 'Электронная почта',
    password: 'Пароль',
    signIn: 'Войти',
    signOut: 'Выйти',
    office: 'Офис',
  },
  dashboard: {
    vehicles: 'Единиц техники',
    activeVehicles: 'В строю',
    drivers: 'Водителей',
    openWaybills: 'Открытых путевых листов',
    tanks: 'Остатки в ёмкостях',
    expiring: 'Истекающие документы',
    daysLeft: 'Осталось дней',
    expired: 'Просрочено',
  },
  vehicle: {
    garageNumber: 'Гаражный номер',
    plateNumber: 'Госномер',
    category: 'Категория',
    model: 'Модель',
    status: 'Статус',
    odometer: 'Одометр, км',
    engineHours: 'Моточасы',
    fuelLevel: 'В баке, л',
    department: 'Подразделение',
  },
  waybill: {
    number: 'Номер',
    period: 'Период',
    vehicle: 'Техника',
    driver: 'Водитель',
    status: 'Статус',
    norm: 'Норма, л',
    actual: 'Факт, л',
    deviation: 'Отклонение',
  },
};

/**
 * Узбекский и английский пока покрывают только навигацию и вход.
 * Отсутствующие ключи автоматически берутся из русского (fallbackLng),
 * поэтому неполный перевод не ломает интерфейс.
 */
const uz = {
  common: {
    save: 'Saqlash',
    cancel: 'Bekor qilish',
    delete: 'O‘chirish',
    edit: 'Tahrirlash',
    create: 'Yaratish',
    search: 'Qidiruv',
    loading: 'Yuklanmoqda…',
    noData: 'Ma’lumot yo‘q',
    actions: 'Amallar',
    confirm: 'Tasdiqlash',
  },
  nav: {
    dashboard: 'Bosh sahifa',
    vehicles: 'Transport',
    drivers: 'Haydovchilar',
    fuel: 'YoMM',
    waybills: 'Yo‘l varaqalari',
    maintenance: 'TXK va ta’mirlash',
    reports: 'Hisobotlar',
    users: 'Foydalanuvchilar',
    admin: 'Ma’muriyat',
    audit: 'Amallar jurnali',
    settings: 'Sozlamalar',
    collapseMenu: 'Menyuni yig‘ish',
    expandMenu: 'Menyuni ochish',
  },
  auth: {
    title: 'Tizimga kirish',
    subtitle: 'Maxsus transport va YoMM hisobi',
    email: 'Elektron pochta',
    password: 'Parol',
    signIn: 'Kirish',
    signOut: 'Chiqish',
    office: 'Ofis',
  },
};

const en = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    search: 'Search',
    loading: 'Loading…',
    noData: 'No data',
    actions: 'Actions',
    confirm: 'Confirm',
  },
  nav: {
    dashboard: 'Dashboard',
    vehicles: 'Vehicles',
    drivers: 'Drivers',
    fuel: 'Fuel',
    waybills: 'Waybills',
    maintenance: 'Maintenance',
    reports: 'Reports',
    users: 'Users',
    admin: 'Administration',
    audit: 'Audit log',
    settings: 'Settings',
    collapseMenu: 'Collapse menu',
    expandMenu: 'Expand menu',
  },
  auth: {
    title: 'Sign in',
    subtitle: 'Ground support equipment and fuel accounting',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    signOut: 'Sign out',
    office: 'Office',
  },
};

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

/**
 * Кириллический узбекский убран: он был заведён отдельным кодом, но показывал
 * те же латинские строки, что и `uz`, — то есть выбор языка ничего не менял.
 * Вернуть его стоит вместе с настоящим переводом, а не раньше.
 */
export const SUPPORTED_LOCALES: LocaleDescriptor[] = [
  { code: 'uz', label: 'O‘zbek', antd: uzUZ, dayjs: 'uz-latn', flag: 'uz' },
  { code: 'en', label: 'English', antd: enUS, dayjs: 'en', flag: 'gb' },
  { code: 'ru', label: 'Русский', antd: ruRU, dayjs: 'ru', flag: 'ru' },
];

export const DEFAULT_LOCALE = 'ru';

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

const storedLocale = localStorage.getItem('gsm.locale');
const initialLocale = localeDescriptor(
  storedLocale ?? (import.meta.env.VITE_DEFAULT_LOCALE as string | undefined) ?? DEFAULT_LOCALE,
).code;

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    uz: { translation: uz },
    en: { translation: en },
  },
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

applyLocaleSideEffects(initialLocale);
i18n.on('languageChanged', applyLocaleSideEffects);

export default i18n;
