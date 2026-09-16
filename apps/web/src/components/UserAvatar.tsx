import { Avatar } from 'antd';

import { useAuthedImage } from '@/api/hooks';
import { colorOf, initials } from '@/lib/avatar';

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
