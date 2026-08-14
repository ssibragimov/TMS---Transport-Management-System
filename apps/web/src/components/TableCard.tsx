import { Card } from 'antd';
import type { CardProps } from 'antd';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Карточка списка с закреплённой шапкой.
 *
 * Проблема, которую она решает: в длинных таблицах поиск и фильтры уезжали
 * вверх при прокрутке, и чтобы сменить фильтр, приходилось возвращаться к
 * началу страницы. Теперь строка фильтров и заголовки колонок остаются на
 * месте.
 *
 * Высота шапки не зашита числом: при узком окне фильтры переносятся на вторую
 * строку, и фиксированное значение оставило бы заголовки таблицы либо с
 * разрывом, либо под панелью. Поэтому она измеряется и передаётся таблице
 * через контекст.
 */

/** Высота шапки приложения — под ней прилипает панель фильтров. */
export const APP_HEADER_HEIGHT = 64;

const StickyOffsetContext = createContext<number>(APP_HEADER_HEIGHT);

/** Отступ сверху для заголовков таблицы: шапка приложения + панель фильтров. */
export function useStickyOffset(): number {
  return useContext(StickyOffsetContext);
}

interface TableCardProps extends Omit<CardProps, 'children'> {
  children: ReactNode;
}

export function TableCard({ children, ...cardProps }: TableCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [headHeight, setHeadHeight] = useState(0);

  useEffect(() => {
    const head = ref.current?.querySelector<HTMLElement>(':scope > .ant-card > .ant-card-head');
    if (!head) return;

    const observer = new ResizeObserver(([entry]) => {
      setHeadHeight(entry.contentRect.height);
    });
    observer.observe(head);
    setHeadHeight(head.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="gsm-table-card">
      <StickyOffsetContext.Provider value={APP_HEADER_HEIGHT + headHeight}>
        <Card {...cardProps}>{children}</Card>
      </StickyOffsetContext.Provider>
    </div>
  );
}
