/**
 * Фон экрана входа — ночной перрон аэропорта.
 *
 * Вся сцена нарисована одним SVG без внешних картинок: ни интернета при
 * разворачивании системы, ни тяжёлых растров в сборке. Композиция:
 * взлётно-посадочная полоса с уходящими в перспективу рядами огней,
 * силуэт самолёта с буксировщиком, диспетчерская вышка с маяком и
 * терминал с редкими окнами. Сцена почти чёрная и намеренно приглушена —
 * её работа держать атмосферу, а не спорить с карточкой входа.
 */

/** Звёзды в верхней части — детерминированный разброс без Math.random. */
const STARS = Array.from({ length: 30 }, (_, index) => {
  const x = (index * 137.5) % 100;
  const y = (index * 61.7) % 100;
  const r = 0.6 + ((index * 7) % 10) / 10;
  const opacity = 0.14 + ((index * 3) % 8) / 14;
  return { x: (x / 100) * 1440, y: (y / 100) * 420, r, opacity };
});

/** Окна терминала: две строки по восемь. */
const WINDOWS = Array.from({ length: 16 }, (_, index) => ({
  x: 52 + (index % 8) * 22,
  y: 414 + Math.floor(index / 8) * 26,
}));

/** Точка схода ВПП и шаг огней к горизонту. */
const VANTAGE = { x: 720, y: 452 };
const BOTTOM_Y = 800;
const EDGE_XS = [130, 1310];
const LIGHT_STEPS = 13;

/** Ряды боковых огней: от ближнего края к горизонту, точки сходятся к точке схода. */
const EDGE_LIGHTS = Array.from({ length: LIGHT_STEPS }, (_, index) => {
  const t = index / (LIGHT_STEPS - 1);
  const y = BOTTOM_Y - (BOTTOM_Y - VANTAGE.y) * t;
  const radius = Math.max(3.6 - 3 * t, 1.2);
  return EDGE_XS.map((edgeX) => ({
    x: VANTAGE.x + (edgeX - VANTAGE.x) * t,
    y,
    radius,
  }));
}).flat();

/** Огни порога ВПП — строка поперёк полосы на горизонте. */
const THRESHOLD_LIGHTS = Array.from({ length: 11 }, (_, index) => ({
  x: 600 + index * 24,
  y: VANTAGE.y + 26,
  radius: index === 0 || index === 10 ? 3.4 : 2.6,
}));

export function LoginBackdrop() {
  return (
    <div className="gsm-backdrop" aria-hidden>
      <svg
        viewBox="0 0 1440 800"
        preserveAspectRatio="xMidYMax slice"
        role="presentation"
      >
        <defs>
          <linearGradient id="gsm-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#051223" />
            <stop offset="0.72" stopColor="#092845" />
            <stop offset="1" stopColor="#0e3556" />
          </linearGradient>
          <linearGradient id="gsm-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0a1c33" />
            <stop offset="1" stopColor="#030a14" />
          </linearGradient>
          {/* Верхняя часть карточки входа уходит за горизонт — затемняем низ,
              чтобы белая карточка читалась поверх сцены. */}
          <linearGradient id="gsm-veil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#040d18" stopOpacity="0" />
            <stop offset="1" stopColor="#040d18" stopOpacity="0.78" />
          </linearGradient>
          <filter id="gsm-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Небо */}
        <rect width="1440" height="800" fill="url(#gsm-sky)" />

        {/* Звёзды */}
        {STARS.map((star, index) => (
          <circle
            key={index}
            cx={star.x}
            cy={star.y}
            r={star.r}
            fill="#ffffff"
            opacity={star.opacity}
          />
        ))}

        {/* Луна */}
        <circle cx="1178" cy="148" r="58" fill="#ffe9bd" opacity="0.06" />
        <circle cx="1178" cy="148" r="42" fill="#f2e6c4" opacity="0.85" />

        {/* Тёплое свечение за горизонтом — подсветка перрона */}
        <ellipse cx="720" cy="470" rx="920" ry="130" fill="#ffbe78" opacity="0.055" />

        {/* Терминал слева */}
        <g fill="#071829">
          <rect x="36" y="398" width="150" height="88" rx="6" />
          <rect x="138" y="416" width="72" height="70" rx="5" />
          <rect x="228" y="428" width="112" height="58" rx="5" />
          <rect x="36" y="486" width="304" height="8" rx="4" />
        </g>
        {WINDOWS.map((window, index) => (
          <rect
            key={index}
            x={window.x}
            y={window.y}
            width="7"
            height="4"
            rx="1"
            fill="#ffdba6"
            opacity="0.4"
          />
        ))}

        {/* Диспетчерская вышка */}
        <g>
          <path d="M1136 388 l16 52 -12 52 -18 -52 Z" fill="#071a2d" />
          <rect x="1112" y="440" width="52" height="17" rx="3" fill="#0a2340" />
          <rect x="1120" y="486" width="36" height="5" rx="2" fill="#0c2a4c" />
          <rect x="1106" y="491" width="64" height="92" fill="#061527" />
          <rect x="1094" y="583" width="88" height="11" rx="3" fill="#040e1a" />
          <rect x="1118" y="396" width="15" height="44" fill="#071a2d" />
          <circle className="gsm-beacon" cx="1140" cy="387" r="5" fill="#ff5a4e" />
          <rect x="1116" y="443" width="18" height="10" rx="1.5" fill="#7fc4ff" opacity="0.35" />
          <rect x="1142" y="443" width="18" height="10" rx="1.5" fill="#7fc4ff" opacity="0.35" />
        </g>

        {/* ВПП */}
        <polygon
          points={`${EDGE_XS[0]},${BOTTOM_Y} ${VANTAGE.x},${VANTAGE.y} ${EDGE_XS[1]},${BOTTOM_Y}`}
          fill="#0a1f36"
          opacity="0.5"
        />
        <path d="M720 452 L720 800" stroke="rgba(255,255,255,0.32)" strokeWidth="2" strokeDasharray="26 18" />
        {EDGE_XS.map((edgeX) => (
          <path
            key={edgeX}
            d={`M${edgeX} ${BOTTOM_Y} L${VANTAGE.x} ${VANTAGE.y}`}
            stroke="rgba(255,255,255,0.09)"
            strokeWidth="2"
          />
        ))}
        {/* Зоны приземления */}
        <rect x="592" y="556" width="34" height="132" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
        <rect x="814" y="556" width="34" height="132" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />

        {/* Огни: боковые ряды и порог */}
        <g filter="url(#gsm-glow)">
          {EDGE_LIGHTS.map((light, index) => (
            <circle
              key={`${index}-row`}
              cx={light.x}
              cy={light.y}
              r={light.radius}
              fill="#ffd9a6"
            />
          ))}
          {THRESHOLD_LIGHTS.map((light, index) => (
            <circle
              key={`threshold-${index}`}
              cx={light.x}
              cy={light.y}
              r={light.radius}
              fill={index === 0 || index === 10 ? '#ff6a5e' : '#ffe9b8'}
            />
          ))}
        </g>

        {/* Земля под сценой */}
        <rect y="452" width="1440" height="348" fill="url(#gsm-ground)" opacity="0.55" />

        {/* Самолёт у рулёжки и буксировщик за ним */}
        <g transform="translate(150 636) scale(1.15)">
          {/* фюзеляж */}
          <path d="M6 26 C 34 16, 92 16, 124 26 C 92 36, 34 36, 6 26 Z" fill="#061527" />
          {/* кокпит */}
          <path d="M106 20 C 118 21, 127 24, 130 26 C 120 27, 110 29, 106 20 Z" fill="#0b2c4e" />
          {/* киль */}
          <path d="M16 26 L8 8 L27 22 Z" fill="#061527" />
          <path d="M10 27 L-1 30 L13 30 Z" fill="#061527" />
          {/* крыло и стабилизатор */}
          <path d="M52 24 L20 4 L76 20 Z" fill="#061527" />
          <path d="M58 28 L36 44 L80 30 Z" fill="#061527" />
          {/* двигатель */}
          <rect x="68" y="30" width="16" height="7" rx="2" fill="#081c33" stroke="rgba(255,255,255,0.06)" />
          {/* габаритный огонь на крыле */}
          <circle className="gsm-beacon gsm-beacon--slow" cx="22" cy="5" r="2.6" fill="#8affa1" />
          {/* буксировщик */}
          <g transform="translate(118 32)">
            <rect x="0" y="0" width="32" height="14" rx="2.5" fill="#071a2d" />
            <path d="M4 14 L2 26 M28 14 L30 26" stroke="#071a2d" strokeWidth="3.4" />
            <circle cx="7" cy="26" r="3.6" fill="#050f1c" />
            <circle cx="25" cy="26" r="3.6" fill="#050f1c" />
            <rect x="14" y="3" width="7" height="4" rx="1" fill="#10253d" />
          </g>
        </g>

        {/* Затемнение низа для читаемости карточки */}
        <rect y="480" width="1440" height="320" fill="url(#gsm-veil)" />
      </svg>
    </div>
  );
}
