import { UndoOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tooltip } from 'antd';
import type { CardProps } from 'antd';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
 *
 * Здесь же живёт кнопка сброса настройки колонок. Она намеренно в шапке, а не
 * над таблицей: появляясь и исчезая над таблицей, она сдвигала бы содержимое
 * вниз при каждой перестановке колонки.
 */

/** Высота шапки приложения — под ней прилипает панель фильтров. */
export const APP_HEADER_HEIGHT = 64;

interface TableCardApi {
  /** Отступ сверху для заголовков таблицы: шапка приложения + панель фильтров. */
  offsetHeader: number;
  /**
   * Таблица сообщает сюда, что её колонки настроены и можно предложить сброс.
   * null — настройки нет, кнопку показывать не нужно.
   */
  registerReset: ((reset: (() => void) | null) => void) | null;
}

const TableCardContext = createContext<TableCardApi>({
  offsetHeader: APP_HEADER_HEIGHT,
  registerReset: null,
});

export function useTableCard(): TableCardApi {
  return useContext(TableCardContext);
}

interface TableCardProps extends Omit<CardProps, 'children'> {
  children: ReactNode;
}

export function TableCard({ children, extra, ...cardProps }: TableCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [headHeight, setHeadHeight] = useState(0);
  const [resetColumns, setResetColumns] = useState<{ run: () => void } | null>(null);

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

  /*
    Функция обязана быть стабильной: таблица держит её в зависимостях эффекта,
    и новая ссылка на каждой отрисовке замкнула бы цикл
    «эффект → setState → отрисовка → новый эффект».
    Обёртка результата в объект — потому что setState принял бы голую функцию
    за ленивое вычисление состояния и вызвал бы её вместо сохранения.
  */
  const registerReset = useCallback(
    (reset: (() => void) | null) => setResetColumns(reset ? { run: reset } : null),
    [],
  );

  const api = useMemo<TableCardApi>(
    () => ({ offsetHeader: APP_HEADER_HEIGHT + headHeight, registerReset }),
    [headHeight, registerReset],
  );

  // Пустой extra не рендерим: Card иначе отводит под него место в шапке.
  const headExtra =
    resetColumns || extra ? (
      <Space size="small">
        {resetColumns && (
          <Tooltip title="Вернуть исходный порядок и ширину колонок">
            <Button
              type="text"
              size="small"
              icon={<UndoOutlined />}
              onClick={resetColumns.run}
              aria-label="Сбросить настройку колонок"
            />
          </Tooltip>
        )}
        {extra}
      </Space>
    ) : undefined;

  return (
    <div ref={ref} className="gsm-table-card">
      <TableCardContext.Provider value={api}>
        <Card {...cardProps} extra={headExtra}>
          {children}
        </Card>
      </TableCardContext.Provider>
    </div>
  );
}
