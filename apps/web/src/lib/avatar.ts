/**
 * Инициалы и цвет подложки для аватара без фото — общие для сотрудников
 * (UserAvatar) и водителей (квадрат фото в DriverDrawer). Вынесены сюда,
 * а не продублированы: логика чистая и одинаковая для обоих, различается
 * только то, откуда берётся сама фотография.
 */

/**
 * Инициалы из ФИО: «Каримов Азиз Рустамович» → «КА».
 * Берём фамилию и имя — отчество в кружке уже не читается.
 */
export function initials(fullName: string | undefined): string {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * Цвет подложки выводится из имени, а не случайный: у одного человека он
 * одинаков во всех списках, и по нему глаз находит строку быстрее, чем по тексту.
 */
const PALETTE = ['#0b3d6b', '#14507f', '#4fa8ae', '#5cb87f', '#a88ad8', '#e07b5f', '#d48806'];

export function colorOf(fullName: string | undefined): string {
  if (!fullName) return PALETTE[0];
  let hash = 0;
  for (const char of fullName) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
