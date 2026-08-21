import { Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';

/**
 * Дата и время в шапке.
 *
 * Смена в аэропорту живёт по часам: путевой лист действует до конкретного
 * времени, медицинский допуск истекает через двенадцать часов, обслуживание
 * рейса привязано ко времени вылета. Диспетчер должен видеть текущее время
 * не переключаясь на часы операционной системы.
 *
 * Формат 24-часовой без вариантов: в авиации других не бывает.
 */
export function HeaderClock() {
  const [now, setNow] = useState(() => dayjs());

  useEffect(() => {
    // Выравниваем тик по началу секунды, иначе цифры меняются с задержкой
    // до секунды после реальной смены времени — заметно, когда на экран смотрят.
    const align = 1000 - dayjs().millisecond();
    let interval: number | undefined;

    const start = window.setTimeout(() => {
      setNow(dayjs());
      interval = window.setInterval(() => setNow(dayjs()), 1000);
    }, align);

    return () => {
      window.clearTimeout(start);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  return (
    <Typography.Text
      style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
      aria-label="Текущие дата и время"
    >
      <span style={{ opacity: 0.65, marginRight: 8 }}>{now.format('DD.MM.YYYY')}</span>
      {/* Моноширинные цифры: без них строка дёргается на каждой смене секунды. */}
      <strong style={{ fontSize: 16 }}>{now.format('HH:mm:ss')}</strong>
    </Typography.Text>
  );
}
