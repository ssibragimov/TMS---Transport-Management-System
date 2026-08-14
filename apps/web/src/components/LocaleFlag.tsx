/**
 * Флаги нарисованы вектором, а не взяты эмодзи.
 *
 * Windows не отрисовывает эмодзи-флаги: пара региональных индикаторов
 * показывается как две буквы («UZ» вместо флага). Платформа работает
 * именно на Windows, поэтому эмодзи здесь не вариант.
 */

interface FlagProps {
  code: 'uz' | 'gb' | 'ru';
  /** Высота в пикселях; ширина считается по пропорции 3:2. */
  size?: number;
}

const RATIO = 3 / 2;

export function LocaleFlag({ code, size = 12 }: FlagProps) {
  const common = {
    width: size * RATIO,
    height: size,
    viewBox: '0 0 30 20',
    role: 'presentation' as const,
    style: { display: 'block', borderRadius: 2, flex: 'none' },
  };

  if (code === 'uz') {
    return (
      <svg {...common}>
        <rect width="30" height="6.4" fill="#0099B5" />
        <rect y="6.4" width="30" height="7.2" fill="#fff" />
        <rect y="13.6" width="30" height="6.4" fill="#1EB53A" />
        <rect y="6.1" width="30" height="0.6" fill="#CE1126" />
        <rect y="13.3" width="30" height="0.6" fill="#CE1126" />
        <circle cx="6.2" cy="3.2" r="2" fill="#fff" />
        <circle cx="6.9" cy="3.2" r="2" fill="#0099B5" />
      </svg>
    );
  }

  if (code === 'ru') {
    return (
      <svg {...common}>
        <rect width="30" height="6.67" fill="#fff" />
        <rect y="6.67" width="30" height="6.66" fill="#0039A6" />
        <rect y="13.33" width="30" height="6.67" fill="#D52B1E" />
      </svg>
    );
  }

  // Великобритания — общепринятый флаг для English в интерфейсах.
  return (
    <svg {...common}>
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0l30 20M30 0L0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0l30 20M30 0L0 20" stroke="#C8102E" strokeWidth="2" />
      <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6.5" />
      <path d="M15 0v20M0 10h30" stroke="#C8102E" strokeWidth="4" />
    </svg>
  );
}
