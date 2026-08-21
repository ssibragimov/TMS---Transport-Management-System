/**
 * Заставка на экране входа: воздушное судно в центре и наземная техника вокруг.
 *
 * Механика движения повторяет экран входа iCloud, и это именно механика,
 * а не хоровод. Три независимых слоя, каждый со своей задачей:
 *
 *   1) появление — плитка выпрыгивает из точки пружинящим easing'ом,
 *      соседние с задержкой, поэтому композиция собирается на глазах;
 *   2) покой — каждая плитка бесконечно дышит по маленькой замкнутой
 *      траектории со своим периодом, так что группа никогда не марширует
 *      в ногу и не повторяет одну и ту же картинку;
 *   3) отклик на курсор — вся россыпь чуть смещается за указателем,
 *      дальние плитки сильнее ближних, отчего появляется глубина.
 *
 * Слои разнесены по вложенным элементам намеренно: три разных transform
 * на одном элементе перезаписывали бы друг друга, а так каждый живёт на
 * своём узле и они перемножаются сами.
 *
 * Раскладка неравномерная по замыслу — разные расстояния от центра и разные
 * размеры плиток. Ровное кольцо одинаковых иконок читается как схема, а не
 * как живая композиция.
 *
 * Иконки нарисованы вектором прямо здесь: картинки пришлось бы класть в
 * сборку, а система разворачивается в том числе там, где интернета нет.
 * Всё движение выключается при prefers-reduced-motion (см. styles.css).
 */

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

interface Satellite {
  /** Положение центра плитки в процентах от размера композиции. */
  x: number;
  y: number;
  /** Сторона плитки в условных единицах (на малых экранах масштабируются). */
  size: number;
  /**
   * Сила отклика на курсор, пиксели при полном отклонении указателя.
   * Чем дальше плитка от центра, тем больше — это и создаёт глубину.
   */
  depth: number;
  /** Период дыхания. У соседей разный, иначе движение выглядит синхронным. */
  floatDuration: number;
  /** Амплитуда дыхания по осям, пиксели. */
  driftX: number;
  driftY: number;
  /** Цвет плитки: иконка, подцветка фона и свечение наследуют его. */
  color: string;
  title: string;
  icon: JSX.Element;
}

/**
 * Порядок в массиве задаёт очередь появления. Она идёт не по кругу, а вразнобой,
 * чтобы сборка композиции не читалась как обход циферблата.
 *
 * Координаты не подобраны на глаз: каждая плитка отстоит от центрального круга
 * и от соседей с запасом не меньше десяти пикселей. Композиция, где иконки
 * липнут к центру, читается как куча, а не как россыпь, — у iCloud вокруг
 * аватара всегда есть воздух.
 */
const SATELLITES: Satellite[] = [
  {
    x: 83.3, y: 37.8, size: 62, depth: 16, floatDuration: 7.5, driftX: 5, driftY: 7,
    color: '#f2a33c',
    title: 'Топливозаправщик',
    icon: (
      <path
        d="M5 15.5V9.5h8l2.5 3h3.5v3M5 15.5h15M5 15.5V17M20 15.5V17M13 9.5V7H6.5v2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    x: 16.1, y: 59.2, size: 58, depth: 15, floatDuration: 8.6, driftX: -6, driftY: 6,
    color: '#4fa8ae',
    title: 'Тягач (pushback)',
    icon: (
      <path
        d="M4 15h16M6 15v-3.5h5l2-2.5h4V15M8 11.5V9h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    x: 69.4, y: 77.8, size: 52, depth: 13, floatDuration: 9.4, driftX: 6, driftY: -5,
    color: '#5cb87f',
    title: 'Амбулифт',
    icon: (
      <path
        d="M3 17h18M6 17v-2h4v2M10 15V8.5h8V15M12 8.5V6M9.5 17l1.5-2M13 8.5v6.5M15.5 8.5V15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    x: 51.1, y: 16.7, size: 47, depth: 20, floatDuration: 6.8, driftX: -4, driftY: -6,
    color: '#7c8ce0',
    title: 'Ленточный транспортёр',
    icon: (
      <path
        d="M3 17h18M5 17v-2.5h6M6 14.5 16 7.5h4M9 12l1.5 1.5M12 10l1.5 1.5M15 8l1.5 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    x: 47.2, y: 83.3, size: 47, depth: 18, floatDuration: 10.2, driftX: 5, driftY: 5,
    color: '#a88ad8',
    title: 'Источник питания (GPU)',
    icon: (
      <path
        d="M4 18h16M6 18v-3.5h4V18M8 14.5V9h8v5.5M12 9V6M10.5 12h3M12 12v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    x: 73.6, y: 16.4, size: 40, depth: 24, floatDuration: 7.9, driftX: 4, driftY: -5,
    color: '#59b6d8',
    title: 'Деайсер',
    icon: (
      <path
        d="M3 17h18M5 17v-3h6v3M8 14 17 7M17 7l-1.5-.5M17 7l.5 1.5M19.5 5.5h.01M20.5 8h.01M18 4h.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    x: 27.8, y: 76.7, size: 42, depth: 21, floatDuration: 8.1, driftX: -5, driftY: 4,
    color: '#e07b5f',
    title: 'Follow-me',
    icon: (
      <path
        d="M3 16h18M5.5 16v-2.5l2-3.5h9l2 3.5V16M8 16v1M18 16v1M11.5 8.5V6.5h1v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    x: 25.8, y: 21.4, size: 38, depth: 26, floatDuration: 9.8, driftX: -4, driftY: -4,
    color: '#e0b94f',
    title: 'Водозаправщик',
    icon: (
      <path
        d="M4 17h16M6 17v-2.5h9V17M15 14.5h4.5V17M12 8.3c1.8 2 3 3.2 3 4.6a3 3 0 1 1-6 0c0-1.4 1.2-2.6 3-4.6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

/** Пауза между появлением соседних плиток. */
const STAGGER_S = 0.09;
/** Центр появляется первым, плитки — после него. */
const CORE_DELAY_S = 0.12;

/**
 * Отклик композиции на движение указателя.
 *
 * Значения кладутся в CSS-переменные, а не в состояние React: перерисовывать
 * дерево на каждое движение мыши незачем, браузер сам пересчитает transform.
 * Обработчик прижат к кадру через requestAnimationFrame — pointermove
 * приходит чаще, чем экран успевает обновиться.
 */
function usePointerParallax<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Ни отклика, ни слушателя там, где это неуместно: при запрете анимаций
    // и на сенсорных экранах, где указателя нет, а pointermove приходит
    // на каждое касание.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    let frame = 0;
    const clamp = (value: number): number => Math.max(-1, Math.min(1, value));

    const onMove = (event: PointerEvent): void => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const rect = node.getBoundingClientRect();
        // Отклонение указателя от центра композиции, приведённое к [-1; 1].
        const dx = clamp((event.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2));
        const dy = clamp((event.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2));
        node.style.setProperty('--px', dx.toFixed(3));
        node.style.setProperty('--py', dy.toFixed(3));
      });
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}

export function LoginHero() {
  const ref = usePointerParallax<HTMLDivElement>();

  return (
    <div className="gsm-hero" ref={ref} aria-hidden>
      {/* Свечение позади композиции — роль жёлтого овала у iCloud. */}
      <div className="gsm-hero-halo" />

      {SATELLITES.map((satellite, index) => (
        <div
          key={satellite.title}
          className="gsm-hero-sat"
          style={
            {
              '--sat-x': `${satellite.x}%`,
              '--sat-y': `${satellite.y}%`,
              '--sat-size': satellite.size,
              '--sat-depth': satellite.depth,
              '--sat-color': satellite.color,
              // Крупные плитки ближе к зрителю и перекрывают мелкие.
              zIndex: Math.round(satellite.size),
            } as CSSProperties
          }
        >
          <div
            className="gsm-hero-sat-float"
            style={
              {
                '--float-duration': `${satellite.floatDuration}s`,
                '--drift-x': `${satellite.driftX}px`,
                '--drift-y': `${satellite.driftY}px`,
                // Отрицательная задержка: дыхание уже идёт к моменту показа,
                // иначе все плитки стартовали бы из одной фазы.
                animationDelay: `${-satellite.floatDuration * (index / SATELLITES.length)}s`,
              } as CSSProperties
            }
          >
            <div
              className="gsm-hero-sat-tile"
              style={{ animationDelay: `${CORE_DELAY_S + index * STAGGER_S}s` }}
            >
              <svg viewBox="0 0 24 24" role="img">
                <title>{satellite.title}</title>
                {satellite.icon}
              </svg>
            </div>
          </div>
        </div>
      ))}

      <div className="gsm-hero-core">
        <div className="gsm-hero-core-tile">
          <svg viewBox="0 0 24 24" role="img">
            <title>Воздушное судно</title>
            {/* Вид сверху: фюзеляж, стреловидное крыло, стабилизатор. */}
            <path
              d="M12 2c.9 0 1.5 1.1 1.5 2.6v3.2l7.5 4.3v2l-7.5-2.2v4l2.6 1.9v1.6L12 18.6l-4.1.8v-1.6l2.6-1.9v-4L3 14.1v-2l7.5-4.3V4.6C10.5 3.1 11.1 2 12 2z"
              fill="currentColor"
            />
          </svg>
          <span className="gsm-hero-core--label">TMS</span>
        </div>
      </div>
    </div>
  );
}
