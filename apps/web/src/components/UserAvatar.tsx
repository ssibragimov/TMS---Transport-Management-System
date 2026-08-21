import { Avatar } from 'antd';

import { useAuthedImage } from '@/api/hooks';

/**
 * Аватар сотрудника.
 *
 * Снимок тянется авторизованным запросом: обычный `<img src>` не приложит
 * заголовок с токеном, и сервер ответит 401. Пока файл грузится — и навсегда,
 * если фотографии нет, — показываются инициалы.
 *
 * Файл запрашивается только при наличии photoKey: лишний 404 на каждого
 * сотрудника без фотографии засорял бы и сеть, и журнал сервера.
 */
interface UserAvatarProps {
  userId: number | undefined;
  fullName: string | undefined;
  /** Ключ файла из профиля. null или undefined — показываем инициалы. */
  photoKey?: string | null;
  size?: number;
}

/**
 * Инициалы из ФИО: «Каримов Азиз Рустамович» → «КА».
 * Берём фамилию и имя — отчество в кружке уже не читается.
 */
function initials(fullName: string | undefined): string {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * Цвет подложки выводится из имени, а не случайный: у одного человека он
 * одинаков во всех списках, и по нему глаз находит строку быстрее, чем по тексту.
 */
const PALETTE = ['#0b3d6b', '#14507f', '#4fa8ae', '#5cb87f', '#a88ad8', '#e07b5f', '#d48806'];

function colorOf(fullName: string | undefined): string {
  if (!fullName) return PALETTE[0];
  let hash = 0;
  for (const char of fullName) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function UserAvatar({ userId, fullName, photoKey, size = 32 }: UserAvatarProps) {
  const src = useAuthedImage(
    photoKey && userId !== undefined ? `/users/${userId}/photo` : null,
  );

  return (
    <Avatar
      size={size}
      src={src ?? undefined}
      style={{
        backgroundColor: src ? undefined : colorOf(fullName),
        // Инициалы масштабируются вместе с кружком: при size=96 стандартный
        // размер шрифта выглядел бы потерянным в центре.
        fontSize: Math.round(size * 0.4),
        flex: 'none',
      }}
    >
      {initials(fullName)}
    </Avatar>
  );
}
