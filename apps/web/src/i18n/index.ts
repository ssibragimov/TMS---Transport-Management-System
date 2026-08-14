import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Мультиязычность подключена с первого дня намеренно.
 *
 * Платформа разворачивается в аэропортах всей страны, и требование
 * узбекского интерфейса возникнет обязательно. Дописывать i18n в готовый
 * продукт втрое дороже, чем заложить его в каркас.
 *
 * Узбекский представлен двумя вариантами письменности: латиница (uz)
 * и кириллица (uz-Cyrl) — обе в активном обиходе.
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

export const SUPPORTED_LOCALES = [
  { code: 'ru', label: 'Русский' },
  { code: 'uz', label: 'O‘zbekcha' },
  { code: 'uz-Cyrl', label: 'Ўзбекча' },
  { code: 'en', label: 'English' },
] as const;

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    uz: { translation: uz },
    'uz-Cyrl': { translation: uz },
    en: { translation: en },
  },
  lng: localStorage.getItem('gsm.locale') ?? import.meta.env.VITE_DEFAULT_LOCALE ?? 'ru',
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
});

export default i18n;
