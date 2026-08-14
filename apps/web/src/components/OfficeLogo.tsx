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
  size?: number;
  /**
   * Фон, на котором стоит логотип. От него зависит только запасной вариант:
   * на светлой шапке белые буквы на прозрачном фоне были бы не видны.
   */
  variant?: 'light' | 'dark';
}

export function OfficeLogo({ officeId, code, size = 32, variant = 'dark' }: OfficeLogoProps) {
  const src = useAuthedImage(officeId ? `/offices/${officeId}/logo` : null);

  if (!src) {
    const onLight = variant === 'light';
    return (
      <div
        aria-hidden
        style={{
          width: size,
          height: size,
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          borderRadius: 6,
          background: onLight ? '#f0f2f5' : 'rgba(255, 255, 255, 0.14)',
          color: onLight ? '#0b3d6b' : '#fff',
          fontSize: size * 0.36,
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
        width: size,
        height: size,
        flex: 'none',
        borderRadius: 6,
        objectFit: 'contain',
        background: '#fff',
      }}
    />
  );
}
