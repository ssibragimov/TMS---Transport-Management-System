import { useAuthedImage } from '@/api/hooks';

/**
 * Логотип аэропорта в шапке бокового меню.
 *
 * Файл запрашивается напрямую, без предварительной проверки «а есть ли он»:
 * хук возвращает null при любой ошибке, включая 404, и тогда показывается
 * запасной вариант с кодом офиса. Лишний запрос на офис без логотипа дешевле,
 * чем тянуть в шапку ещё один список только ради флажка наличия.
 */
interface OfficeLogoProps {
  officeId: number | undefined;
  /** Код офиса — запасной вариант, когда логотип не загружен. */
  code: string;
  /** Высота логотипа. Ширина считается по пропорциям самого файла. */
  height?: number;
  /**
   * Фон, на котором стоит логотип. От него зависит только запасной вариант:
   * на светлой шапке белые буквы на прозрачном фоне были бы не видны.
   */
  variant?: 'light' | 'dark';
}

/**
 * Ширина ограничена, чтобы вытянутый логотип не выдавил из шапки
 * переключатель офиса. Внутри этого предела картинка масштабируется целиком,
 * без обрезки.
 */
const MAX_WIDTH = 200;

export function OfficeLogo({ officeId, code, height = 40, variant = 'dark' }: OfficeLogoProps) {
  const src = useAuthedImage(officeId ? `/offices/${officeId}/logo` : null);
  const onLight = variant === 'light';

  if (!src) {
    return (
      <div
        aria-hidden
        style={{
          height,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          borderRadius: 6,
          background: onLight ? '#f0f2f5' : 'rgba(255, 255, 255, 0.14)',
          color: onLight ? '#0b3d6b' : '#fff',
          fontSize: Math.round(height * 0.4),
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        {code.slice(0, 3).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      style={{
        // Задана только высота: ширина следует из пропорций загруженного
        // файла. Квадратная рамка обрезала бы вытянутый логотип полями и
        // визуально уменьшала его.
        height,
        width: 'auto',
        maxWidth: MAX_WIDTH,
        flex: 'none',
        objectFit: 'contain',
        display: 'block',
      }}
    />
  );
}
